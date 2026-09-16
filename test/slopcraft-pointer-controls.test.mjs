import test from 'node:test';
import assert from 'node:assert/strict';
import {installSlopcraftPointerControls} from '../tools/slopcraft-pointer-controls.js';
class Events{
 listeners=new Map();style={};dataset={};
 addEventListener(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
 emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn({preventDefault(){},...event});}
}
function fixture({request='pending'}={}){
 const win=new Events(),doc=new Events(),canvas=new Events(),stage=new Events(),overlay=new Events(),crosshair=new Events();
 const state={active:false,releases:0,look:[],breaks:0,places:0,hidden:false,focused:0,captures:new Set()};
 let rejected;win.setTimeout=()=>1;win.clearTimeout=()=>{};doc.defaultView=win;doc.hidden=false;doc.pointerLockElement=null;
 doc.createElement=()=>new Events();doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.emit('pointerlockchange');};
 canvas.ownerDocument=doc;canvas.isConnected=true;canvas.style.cursor='';canvas.focus=()=>state.focused++;
 canvas.setPointerCapture=id=>state.captures.add(id);canvas.hasPointerCapture=id=>state.captures.has(id);canvas.releasePointerCapture=id=>state.captures.delete(id);
 if(request!=='missing')canvas.requestPointerLock=()=>{if(request==='throw')throw Error('unsupported');return {catch:fn=>{rejected=fn;}};};
 stage.querySelector=()=>crosshair;stage.appendChild=el=>{state.hint=el;};overlay.classList={toggle:(_,on)=>state.hidden=on};
 const controls=installSlopcraftPointerControls({canvas,stage,overlay,onActive:v=>state.active=v,onRelease:()=>state.releases++,onLook:(x,y)=>state.look.push([x,y]),onBreak:()=>state.breaks++,onPlace:()=>state.places++});
 return {win,doc,canvas,stage,crosshair,overlay,state,controls,reject:()=>rejected(),lock:()=>{doc.pointerLockElement=canvas;doc.emit('pointerlockchange');}};
}
test('real pointer lock keeps native relative look, one reticle and original mining/placing',()=>{
 const f=fixture();f.overlay.emit('click');assert.equal(f.state.focused,1);f.lock();
 assert.equal(f.stage.dataset.slopLook,'locked');assert.equal(f.canvas.style.cursor,'none');assert.equal(f.crosshair.style.display,'');assert.equal(f.state.hidden,true);
 f.doc.emit('mousemove',{movementX:5,movementY:-3});f.canvas.emit('pointerdown',{button:0});f.canvas.emit('pointerdown',{button:2});
 assert.deepEqual(f.state.look,[[5,-3]]);assert.equal(f.state.breaks,1);assert.equal(f.state.places,1);
 f.doc.exitPointerLock();assert.equal(f.state.active,false);assert.equal(f.canvas.style.cursor,'');assert.equal(f.crosshair.style.display,'none');
});
test('declined capture has explicit drag controls and releases captured movement outside the canvas',()=>{
 const f=fixture();f.overlay.emit('click');f.reject();assert.equal(f.stage.dataset.slopLook,'drag');assert.equal(f.state.hint.style.display,'block');assert.equal(f.canvas.style.cursor,'none');
 f.canvas.emit('pointerdown',{button:0,pointerId:7,clientX:40,clientY:50});assert.ok(f.state.captures.has(7));
 f.canvas.emit('pointermove',{pointerId:7,clientX:90,clientY:45});f.canvas.emit('pointerup',{button:0,pointerId:7});
 assert.deepEqual(f.state.look,[[50,-5]]);assert.equal(f.state.breaks,0);assert.equal(f.state.captures.size,0);
 f.canvas.emit('pointermove',{pointerId:7,clientX:190,clientY:45});assert.equal(f.state.look.length,1);
 f.canvas.emit('pointerdown',{button:0,pointerId:8,clientX:40,clientY:50});f.canvas.emit('pointerup',{button:0,pointerId:8});assert.equal(f.state.breaks,1);
});
test('fallback cancellation and stale lock callbacks cannot mine or resume a paused game',()=>{
 const f=fixture();f.overlay.emit('click');f.controls.leave();f.reject();f.lock();assert.equal(f.state.active,false);assert.equal(f.doc.pointerLockElement,null);assert.equal(f.state.hidden,false);
 f.overlay.emit('click');f.reject();f.canvas.emit('pointerdown',{button:0,pointerId:2,clientX:10,clientY:10});f.canvas.emit('pointercancel');f.canvas.emit('pointerup',{button:0,pointerId:2});assert.equal(f.state.breaks,0);assert.equal(f.state.captures.size,0);
 f.win.emit('blur');assert.equal(f.stage.dataset.slopLook,'paused');assert.equal(f.canvas.style.cursor,'');assert.ok(f.state.releases>0);
});
test('absent and throwing APIs stay playable; Escape and hidden documents restore normal cursor',()=>{
 for(const request of ['missing','throw']){
  const f=fixture({request});f.overlay.emit('click');assert.equal(f.stage.dataset.slopLook,'drag');
  f.win.emit('keydown',{code:'Escape'});assert.equal(f.stage.dataset.slopLook,'paused');
  f.overlay.emit('click');f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(f.state.active,false);assert.equal(f.state.hidden,false);assert.equal(f.crosshair.style.display,'none');
 }
});
