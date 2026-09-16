// Rebuild the June desktop originals from their immutable Git source.
// This command only writes reviewable bundles. It performs no database writes.
// node tools/restore-desktop-originals.mjs /tmp/slop-desktop-originals
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'rolldown';
import {RUNTIME, RUNTIME_SHA256} from '../../slop-mobile/supabase/functions/slop-creator/authoring.generated.mjs';
import {additionalGames, prepareAdditionalSource} from './restore-additional-desktop.mjs';

const sourceCommit = '0c7aef1';
const additional = process.argv.includes('--additional');
const output = path.resolve(process.argv.slice(2).find(value=>!value.startsWith('--')) || (additional?'/tmp/slop-web-redesign/restored-desktop-additional':'/tmp/slop-desktop-originals'));
const source = file => execFileSync('git', ['show', `${sourceCommit}:${file}`], {maxBuffer:4*1024*1024}).toString();
const digest = value => createHash('sha256').update(value).digest('hex');
const games = additional ? additionalGames : [
  {id:'run-infinite-desktop', old:'run3', name:'Run Infinite', width:800, height:600,
    description:'The original June desktop gravity runner. A/D or arrow keys steer around the tunnel; Space jumps. Score is distance in metres.',
    restart:'startSolo()', score:'Math.floor(game.dist)',
    end:'function endRun() {', result:'Math.floor(game.dist)'},
  {id:'slopkart-desktop', old:'slopkart', name:'SlopKart', width:960, height:600,
    description:'The original June desktop kart racer. Race the CPUs, drift for turbo and use items. Race placement awards 4, 3, 2 or 1 points; best-lap time stays in the game.',
    restart:"game.mode = 'single'; startRace()", score:'0',
    end:'function finishRace() {', result:'Math.max(1, FIELD - mine + 1)'},
  {id:'sloppy-zombies-desktop', old:'sloppy-zombies', name:'Sloppy Zombies', width:800, height:600,
    description:'The original June desktop zombie survival game. WASD moves, mouse aims and shoots. Survive rounds, repair windows and upgrade weapons. Score is the round reached.',
    restart:'startSingle()', score:'game.round',
    end:'function gameOver() {', result:'game.round'},
];

await fs.mkdir(output, {recursive:true});
const vendorUrl='https://unpkg.com/three@0.160.0/build/three.module.js';
const vendorHash='76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495';
const response=await fetch(vendorUrl);
if(!response.ok)throw Error('The original pinned Three.js dependency is unavailable');
const three=await response.text();
if(digest(three)!==vendorHash)throw Error('Pinned Three.js integrity changed');
const threePath=path.join(output,'three.module.js');
await fs.writeFile(threePath,three);
const fontUrl='https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;800;900&family=Space+Mono:wght@400;700&display=swap';
const fontResponse=await fetch(fontUrl,{headers:{'User-Agent':'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}});
if(!fontResponse.ok)throw Error('Original font stylesheet unavailable');
let fontCss=[...(await fontResponse.text()).matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[\s\S]*?\})/g)].map(match=>match[1]).join('\n');
if(!fontCss.includes('Fredoka One')||!fontCss.includes('Nunito')||!fontCss.includes('Space Mono'))throw Error('Original font subsets unavailable');
for(const url of new Set([...fontCss.matchAll(/url\((https:[^)]+)\)/g)].map(match=>match[1]))){
  const response=await fetch(url);if(!response.ok)throw Error('Original font unavailable');
  fontCss=fontCss.replaceAll(url,`data:font/woff2;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`);
}
const fontLicenses={};
for(const family of ['fredokaone','nunito','spacemono']){
 const revision=family==='fredokaone'?'be2838a23fd2918408e22b25c54135da76525ff6':'main';
 const response=await fetch(`https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${family}/OFL.txt`);
 if(!response.ok)throw Error(`Original font license unavailable: ${family}`);
 fontLicenses[`licenses/${family}-OFL.txt`]=await response.text();
}

function replaceOnce(text, before, after) {
  if(text.split(before).length!==2)throw Error(`Source seam changed: ${before}`);
  return text.replace(before,after);
}
const manifest=[];
for(const entry of games){
  const folder=path.join(output,entry.id);await fs.mkdir(folder,{recursive:true});
  const original=source(`games/${entry.old}/game.js`);
  let sourceFiles;
  let additionalResult;
  if(additional)additionalResult=await prepareAdditionalSource({entry,folder,source,threePath,replaceOnce});
  let code=original.replace(/^import .*;\s*$/mg,'');
  if(additional){code=additionalResult.code;sourceFiles=additionalResult.originals;}else{
  const netSource=source(entry.old==='sloppy-zombies'?'games/sloppy-zombies/network.js':'js/netcore.js');
  code=netSource.replace(/^export /mg,'')+'\n'+code;
  code='let slopPaused=false, slopEnded=false, slopMuted=false, slopLastScore=-1;\n'+code;
  if(entry.old==='run3')code=replaceOnce(code,'function beep(freq, dur, type, vol) {','function beep(freq, dur, type, vol) {\nif(slopPaused||slopMuted)return;');
  else if(entry.old==='slopkart')code=replaceOnce(code,'const ac = () => {','const ac = () => { if(slopPaused||slopMuted)return null;');
  else code=replaceOnce(code,'function ac() {','function ac() {\nif(slopPaused||slopMuted)return null;');
  code=replaceOnce(code,'function frame(now) {',`function frame(now) {
if (slopPaused || slopEnded) { last = now; requestAnimationFrame(frame); return; }
const liveScore=Math.max(0,Math.floor(${entry.score}));
if(liveScore!==slopLastScore){slopLastScore=liveScore;Slop.score(liveScore);}`);
  if(entry.old==='slopkart'){
    code=replaceOnce(code,'new THREE.WebGLRenderer({ canvas, antialias: true })','new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })');
    code=replaceOnce(code,"show($('ov-results'));\nif (game.mode === 'host')",`slopEnded=true;Slop.finished(${entry.result});\nif (game.mode === 'host')`);
    code=`import * as THREE from ${JSON.stringify(threePath)};\n`+code;
  }else{
    code=replaceOnce(code,entry.end,entry.end+`\nif(slopEnded)return;slopEnded=true;Slop.finished(${entry.result});`);
    code=code.replace("show($('ov-end'));", "// Host owns the result surface.");
    code=code.replace("show($('ov-gameover'));", "// Host owns the result surface.");
  }
  // The old mobile embed path crops the desktop arena and auto-restarts runs.
  if(entry.old==='run3')code=replaceOnce(code,"const EMBED = new URLSearchParams(location.search).has('embed');",'const EMBED = false;');
  code+=`\nfunction clearSlopInput(){
for(const key of Object.keys(keys))delete keys[key];
${entry.old==='sloppy-zombies'?'mouseDown=false;':''}
}
function resetSlopRun(){
slopEnded=false;slopPaused=false;slopLastScore=-1;clearSlopInput();
${entry.restart};Slop.score(0);
}
Slop.onPause(()=>{slopPaused=true;clearSlopInput();actx?.suspend().catch(()=>{});});
Slop.onResume(()=>{slopPaused=false;last=performance.now();if(!slopMuted)actx?.resume().catch(()=>{});});
Slop.onRestart(resetSlopRun);
addEventListener('blur',clearSlopInput);
addEventListener('message',event=>{
 if(event.source!==parent||typeof event.data!=='string'||event.data.length>1024)return;
 let value;try{value=JSON.parse(event.data)}catch{return}
 if(value.type!=='mute'||typeof value.on!=='boolean')return;
 slopMuted=value.on;
 if(slopMuted||slopPaused)actx?.suspend().catch(()=>{});else actx?.resume().catch(()=>{});
});
resetSlopRun();
requestAnimationFrame(()=>requestAnimationFrame(()=>Slop.ready()));
`;
  code=code.replace('requestAnimationFrame(()=>requestAnimationFrame(()=>Slop.ready()));','document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>Slop.ready())));');
  }
  const rawPath=path.join(folder,'game-source.js');await fs.writeFile(rawPath,code);
  const built=await build({input:rawPath,write:false,output:{format:'iife',minify:true}});
  const script=built.output.find(item=>item.type==='chunk').code;
  let html=source(`games/${entry.old}/index.html`);
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link[^>]+fonts\.googleapis[^>]*>/gi,'')
    .replace(/<a class="back-link"[\s\S]*?<\/a>/gi,'');
  html=html.replace('</head>',`<style>${fontCss}</style><style>
html,body{width:100%;height:100%;min-height:0;overflow:hidden}
#shell{padding:0;width:100%;height:100%}#stage{width:min(100%,calc(100vh * ${entry.width}/${entry.height}));aspect-ratio:${entry.width}/${entry.height}}
.back-link,#btn-multi,#btn-title,#btn-go-title,#rxd,#rxd-toggle{display:none!important}
canvas{box-shadow:none!important;border:0!important;border-radius:0!important}
${additional?'#stage{border:0;box-shadow:none;border-radius:0}':''}
</style><script src="slop.js"></script></head>`);
  html=html.replace('</body>','<script src="game.js"></script></body>');
  const files={'index.html':html,'game.js':script,'slop.js':RUNTIME,...fontLicenses};
  for(const [name,content]of Object.entries(files)){const target=path.join(folder,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content);}
  const record={...entry,supported_platforms:['desktop'],source_commit:sourceCommit,
    source_game_sha256:digest(original),runtime_sha256:RUNTIME_SHA256,
    ...(sourceFiles?{source_files_sha256:sourceFiles}:{}),
    files:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,{bytes:Buffer.byteLength(content),sha256:digest(content)}]))};
  await fs.writeFile(path.join(folder,'bundle.json'),JSON.stringify({name:entry.name,description:entry.description,files},null,2));
  manifest.push(record);
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest.map(({id,files})=>({id,files})),null,2));
