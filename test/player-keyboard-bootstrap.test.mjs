import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../src/lib/player-bootstrap.js',import.meta.url),'utf8');

function fixture() {
  const listeners=new Map(),documentListeners=new Map(),canvasListeners=new Map(),events=[],messages=[];
  const listen=(map,type,fn,capture=false)=>{if(!map.has(type))map.set(type,[]);map.get(type).push({fn,capture});};
  const run=(map,event,capture)=>{for(const item of map.get(event.type)||[]){if(item.capture===capture)item.fn(event);if(event.immediate)break;}};
  const parent={postMessage:message=>messages.push(JSON.parse(message))};
  class KeyboardEvent {constructor(type,options={}){Object.assign(this,{type,isTrusted:false,defaultPrevented:false},options);}preventDefault(){this.defaultPrevented=true;}stopImmediatePropagation(){this.immediate=true;}}
  const dispatch=(target,event)=>{
    event.target=target;events.push(event);run(listeners,event,true);if(event.immediate)return;
    run(documentListeners,event,true);if(target===canvas)run(canvasListeners,event,false);
    run(documentListeners,event,false);run(listeners,event,false);
  };
  const canvas={isConnected:true,closest:()=>null,hasAttribute:()=>false,setAttribute(){},focus(){document.activeElement=canvas;},dispatchEvent:event=>dispatch(canvas,event)};
  const body={isConnected:true,closest:()=>null,dispatchEvent:event=>dispatch(body,event)};
  const document={hidden:false,activeElement:canvas,body,pointerLockElement:null,addEventListener:(type,fn,capture)=>listen(documentListeners,type,fn,!!capture),querySelector:()=>canvas};
  const window={dispatchEvent:event=>dispatch(window,event)};
  runInNewContext(source,{window,parent,document,KeyboardEvent,addEventListener:(type,fn,capture)=>listen(listeners,type,fn,!!capture),requestAnimationFrame:()=>1,queueMicrotask});
  const message=(value,origin=parent)=>run(listeners,{type:'message',source:origin,data:JSON.stringify(value)},false);
  const native=(type,key,code,extra={})=>dispatch(document.activeElement,new KeyboardEvent(type,{key,code,isTrusted:true,keyCode:/^Key/.test(code)?code.charCodeAt(3):0,...extra}));
  return {listeners,documentListeners,canvasListeners,events,messages,document,canvas,body,message,native,listen};
}
test('host WASD reaches canvas, document and window handlers with authored key/code/modifier values',()=>{
  const f=fixture(),seen=[];
  for(const [map,name] of [[f.canvasListeners,'canvas'],[f.documentListeners,'document'],[f.listeners,'window']])f.listen(map,'keydown',event=>seen.push([name,event.key,event.code,event.shiftKey,event.keyCode]));
  f.message({type:'hostKey',down:true,key:'W',code:'KeyW',shiftKey:true,keyCode:87});
  assert.deepEqual(seen,[['canvas','W','KeyW',true,87],['document','W','KeyW',true,87],['window','W','KeyW',true,87]]);
  assert.equal(f.events.length,1);
  f.message({type:'hostKey',down:true,key:'W',code:'KeyW',shiftKey:true,keyCode:87});assert.equal(f.events.length,1);
});
test('explicit nested focus targets the playfield before the first press and preserves authored menu/input focus',()=>{
  const f=fixture();f.document.activeElement=f.body;f.message({type:'hostFocus'});assert.equal(f.document.activeElement,f.canvas);
  const menu={closest:()=>true};f.document.activeElement=menu;f.message({type:'hostFocus'});assert.equal(f.document.activeElement,menu);
  f.document.activeElement=f.body;f.message({type:'pause'});f.message({type:'hostFocus'});assert.equal(f.document.activeElement,f.body);
});
test('native keyup completes a host first press without duplicate release, then the next native press works',()=>{
  const f=fixture(),held=new Set();f.listen(f.documentListeners,'keydown',event=>held.add(event.code));f.listen(f.documentListeners,'keyup',event=>held.delete(event.code));
  f.message({type:'hostKey',key:'w',code:'KeyW',down:true});assert.equal(held.has('KeyW'),true);
  f.native('keyup','w','KeyW');assert.equal(held.size,0);const total=f.events.length;
  f.message({type:'hostKey',key:'w',code:'KeyW',down:false});assert.equal(f.events.length,total);
  f.native('keydown','w','KeyW');assert.equal(held.has('KeyW'),true);f.native('keyup','w','KeyW');assert.equal(held.size,0);
});
test('pause, restart, blur, hidden pages and editable focus release every native held control',()=>{
  for(const reason of ['pause','restart','blur','hidden','editable']){
    const f=fixture(),held=new Set();f.listen(f.listeners,'keydown',event=>held.add(event.code));f.listen(f.listeners,'keyup',event=>held.delete(event.code));
    f.native('keydown','w','KeyW');f.native('keydown','Shift','ShiftLeft',{shiftKey:true});assert.equal(held.size,2);
    if(['pause','restart'].includes(reason))f.message({type:reason});
    else if(reason==='blur')for(const {fn} of f.listeners.get('blur'))fn();
    else if(reason==='hidden'){f.document.hidden=true;for(const {fn} of f.documentListeners.get('visibilitychange'))fn();}
    else for(const {fn} of f.documentListeners.get('focusin'))fn({target:{closest:()=>true}});
    assert.equal(held.size,0,reason);assert.equal(f.events.filter(event=>event.type==='keyup').length,2,reason);
    if(reason==='pause'){f.native('keydown','d','KeyD');assert.equal(held.size,0);f.message({type:'resume'});f.native('keydown','d','KeyD');assert.equal(held.has('KeyD'),true);}
  }
});
test('host messages cannot inject shortcuts, malformed keys, other-source events or editable-field input',()=>{
  const f=fixture();f.message({type:'hostKey',down:true,key:'w',code:'KeyW'},{});assert.equal(f.events.length,0);
  for(const value of [{code:'Tab',key:'Tab'},{code:'bad',key:'w'},{code:'KeyW',key:'bad\nkey'},{code:'KeyW',key:''},{code:'KeyR',key:'r',ctrlKey:true},{code:'KeyW',key:'w',metaKey:true},{code:'ArrowLeft',key:'ArrowLeft',altKey:true}])f.message({type:'hostKey',down:true,...value});assert.equal(f.events.length,0);
  f.document.activeElement={closest:()=>true};f.message({type:'hostKey',down:true,key:'w',code:'KeyW'});assert.equal(f.events.length,0);
});
test('Escape reaches game handlers while cancelling parent dialog dismissal and notifying only the host',()=>{
  const f=fixture(),seen=[];f.listen(f.listeners,'keydown',event=>seen.push(event.key));f.native('keydown','Escape','Escape');
  assert.deepEqual(seen,['Escape']);assert.equal(f.events[0].defaultPrevented,true);assert.equal(f.messages.at(-1).type,'webEscape');
});
