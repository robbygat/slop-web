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
    code=replaceOnce(code,'let locked = false;',`let locked = false;
let slopDragLook=false,slopDragStart=null,slopDragLast=null,slopDragDistance=0;
const slopDragHint=document.createElement('div');
slopDragHint.textContent='Drag to look · click to break · right-click to place · Esc to pause';
slopDragHint.style.cssText='display:none;position:absolute;left:12px;right:12px;top:12px;z-index:8;text-align:center;font:12px Nunito,sans-serif;color:white;text-shadow:0 1px 4px #000;pointer-events:none';
stage.appendChild(slopDragHint);
function leaveSlopLook(){
 slopDragLook=false;slopDragStart=null;slopDragLast=null;locked=false;
 slopDragHint.style.display='none';overlay.classList.remove('hidden');
 if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
}
function useSlopDragLook(){
 if(slopPaused)return;
 slopDragLook=true;locked=true;overlay.classList.add('hidden');
 slopDragHint.style.display='block';
}
function beginSlopLook(){
 try{
  if(!renderer.domElement.requestPointerLock){useSlopDragLook();return;}
  const request=renderer.domElement.requestPointerLock();
  if(request&&typeof request.catch==='function')request.catch(useSlopDragLook);
 }catch{useSlopDragLook();}
}
document.addEventListener('pointerlockerror',useSlopDragLook);
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&slopDragLook)leaveSlopLook();});`);
    code=replaceOnce(code,"overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());","overlay.addEventListener('click', beginSlopLook);");
    code=replaceOnce(code,`locked = document.pointerLockElement === renderer.domElement;
overlay.classList.toggle('hidden', locked);`,`if(document.pointerLockElement===renderer.domElement){
 slopDragLook=false;locked=true;slopDragHint.style.display='none';
}else if(!slopDragLook){locked=false;}
overlay.classList.toggle('hidden',locked);`);
    code=replaceOnce(code,`if (!locked) return;
player.yaw += e.movementX * 0.0024;
player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0024));`,`if (!locked) return;
let dx=e.movementX,dy=e.movementY;
if(slopDragLook){
 if(!slopDragStart||!slopDragLast)return;
 dx=e.clientX-slopDragLast.x;dy=e.clientY-slopDragLast.y;
 slopDragLast={x:e.clientX,y:e.clientY};slopDragDistance+=Math.hypot(dx,dy);
}
player.yaw += dx * 0.0024;
player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - dy * 0.0024));`);
    code=replaceOnce(code,`if (e.button === 0) breakBlock();
if (e.button === 2) placeBlock();`,`if(slopDragLook&&e.button===0){
 slopDragStart={x:e.clientX,y:e.clientY};slopDragLast=slopDragStart;slopDragDistance=0;
}else if(e.button===0)breakBlock();
if(e.button===2)placeBlock();`);
    code+=`
document.addEventListener('mouseup',e=>{
 if(e.button!==0||!slopDragStart)return;
 const shouldBreak=slopDragLook&&locked&&slopDragDistance<5;
 slopDragStart=null;slopDragLast=null;
 if(shouldBreak)breakBlock();
});
`;
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
