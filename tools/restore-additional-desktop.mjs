import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const additionalGames = [
  {id:'dungeon-panic-desktop',old:'dungeon-panic',name:'Dungeon Panic',width:800,height:600,
    description:'The original June dungeon roguelike. WASD moves; arrow keys aim and shoot. Clear rooms, collect blessings and descend. Score is the original dungeon score.',
    score:'game.score',score_kind:'dungeon_score',restart:'startSingle()'},
  {id:'slopcraft-desktop',old:'slopcraft',name:'Slopcraft',width:960,height:540,
    description:'The original June creative voxel world. Click to look around, WASD moves, Space jumps, left click breaks and right click places blocks. An open-ended sandbox without a ranked score.',
    score:'0',score_kind:'unscored',restart:'spawnOnSurface();player.vel.set(0,0,0);player.yaw=0.7;player.pitch=-0.15'},
  {id:'umbral-red-desktop',old:'umbral-red',name:'Umbral Red',width:800,height:600,
    description:'The original June creature-taming RPG. WASD or arrows move; Space confirms and interacts. Explore the marsh, battle wild umbrae and bind a party. An open-ended journey without a ranked score.',
    score:'0',score_kind:'unscored',restart:'confirmPressed=false;game.battle=null;game.dialog=null;startGame()'},
];

export async function prepareAdditionalSource({entry,folder,source,threePath,replaceOnce}) {
  const originals={};
  const read=name=>{const text=source(`games/${entry.old}/${name}`);originals[name]=createHash('sha256').update(text).digest('hex');return text;};
  let code=read('game.js');
  let audio='';
  let clear='';
  let pause='';
  let resume='';
  if(entry.old==='dungeon-panic'){
    for(const name of ['assets.js','entities.js','dungeon.js','ui.js','network.js']){
      let content=read(name);
      if(name==='assets.js'){
        content=replaceOnce(content,'function ac() {',`let slopAudioHeld=false;
export function setSlopAudio(paused,muted){
 slopAudioHeld=paused||muted;
 if(slopAudioHeld)actx?.suspend().catch(()=>{});else actx?.resume().catch(()=>{});
}
function ac() {
if(slopAudioHeld)return null;`);
      }
      if(name==='ui.js'){
        const first=content.indexOf('export function loadFont() {');
        const last=content.indexOf('\nconst FREDOKA',first);
        if(first<0||last<first)throw Error('Original dungeon font seam changed');
        content=content.slice(0,first)+'export function loadFont(){return document.fonts.ready;}\n'+content.slice(last);
      }
      await fs.writeFile(path.join(folder,name),content);
    }
    code="import {setSlopAudio} from './assets.js';\n"+code;
    code=replaceOnce(code,'function gameOver() {','function gameOver() {\nif(slopEnded)return;slopEnded=true;Slop.finished(game.score);');
    if(code.split("show($('ov-dead'));").length!==3)throw Error('Original dungeon result seams changed');
    code=code.replaceAll("show($('ov-dead'));","// The shared Slop player owns the result panel.");
    code=replaceOnce(code,"const room = new URLSearchParams(location.search).get('room');",'const room = null; // Standalone release: legacy PeerJS rooms are unavailable.');
    audio='setSlopAudio(slopPaused,slopMuted);';
  }else if(entry.old==='slopcraft'){
    code=replaceOnce(code,"import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';",`import * as THREE from ${JSON.stringify(threePath)};`);
    code="import {installSlopcraftPointerControls} from "+JSON.stringify(new URL('./slopcraft-pointer-controls.js',import.meta.url).pathname)+";\n"+code;
    const inputStart=code.indexOf('// ---------------------------------------------------------------- pointer lock');
    const inputEnd=code.indexOf('// ---------------------------------------------------------------- boot & loop',inputStart);
    if(inputStart<0||inputEnd<inputStart)throw Error('Original Slopcraft input seams changed');
    code=code.slice(0,inputStart)+`// ---------------------------------------------------------------- pointer lock
const overlay=document.getElementById('overlay');
let locked=false;
const slopLook=installSlopcraftPointerControls({
 canvas:renderer.domElement,stage,overlay,isPaused:()=>slopPaused,
 onActive:value=>{locked=value;},onRelease:()=>{for(const key of Object.keys(keys))delete keys[key];},
 onLook:(dx,dy)=>{player.yaw+=dx*.0024;player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch-dy*.0024));},
 onBreak:breakBlock,onPlace:placeBlock,
});
function leaveSlopLook(){slopLook.leave();}

`+code.slice(inputEnd);
    pause='leaveSlopLook();';
    // Pointer lock is always reacquired through the original user gesture.
    resume='';
  }else if(entry.old==='umbral-red'){
    clear='confirmPressed=false;';
  }
  code='let slopPaused=false,slopEnded=false,slopMuted=false,slopLastScore=-1;\n'+code;
  code=replaceOnce(code,'function frame(now) {',`function frame(now) {
if(slopPaused||slopEnded){last=now;requestAnimationFrame(frame);return;}
const slopScore=Math.max(0,Math.floor(${entry.score}));
if(slopScore!==slopLastScore){slopLastScore=slopScore;Slop.score(slopScore);}`);
  code+=`
function clearSlopInput(){for(const key of Object.keys(keys))delete keys[key];${clear}}
function resetSlopRun(){
 slopEnded=false;slopPaused=false;slopLastScore=-1;clearSlopInput();
 ${pause}${entry.restart};${audio}Slop.score(0);
}
Slop.onPause(()=>{slopPaused=true;clearSlopInput();${pause}${audio}});
Slop.onResume(()=>{slopPaused=false;last=performance.now();${resume}${audio}});
Slop.onRestart(resetSlopRun);
addEventListener('blur',clearSlopInput);
addEventListener('message',event=>{
 if(event.source!==parent||typeof event.data!=='string'||event.data.length>1024)return;
 let value;try{value=JSON.parse(event.data)}catch{return}
 if(value.type!=='mute'||typeof value.on!=='boolean')return;
 slopMuted=value.on;${audio}
});
${entry.old==='dungeon-panic'?'resetSlopRun();':''}
document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>Slop.ready())));
`;
  return {code,originals};
}
