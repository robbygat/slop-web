import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const relaySource=await readFile(new URL('../public/game-frame/relay.js',import.meta.url),'utf8');
const bootstrapSource=await readFile(new URL('../src/lib/player-bootstrap.js',import.meta.url),'utf8');

test('mouse capture requires the trusted host opt-in and a real playfield gesture',()=>{
 const listeners=new Map(),docListeners=new Map(),messages=[];let captures=0;
 const listen=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
 const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};
 const parent={postMessage:value=>messages.push(JSON.parse(value))};
 const canvas={requestPointerLock(){captures++;},closest:selector=>selector==='canvas'?canvas:null};
 const document={pointerLockElement:null,addEventListener:(type,fn)=>docListeners.set(type,fn),querySelector:()=>canvas,exitPointerLock(){this.pointerLockElement=null;docListeners.get('pointerlockchange')();}};
 runInNewContext(bootstrapSource,{window:{},parent,document,addEventListener:listen,requestAnimationFrame:()=>1});
 const gesture={isTrusted:true,target:canvas};emit('pointerdown',gesture);assert.equal(captures,0);
 emit('message',{source:{},data:JSON.stringify({type:'hostPointerMode',enabled:true})});emit('pointerdown',gesture);assert.equal(captures,0);
 emit('message',{source:parent,data:JSON.stringify({type:'hostPointerMode',enabled:true})});
 emit('pointerdown',{...gesture,isTrusted:false});assert.equal(captures,0);
 emit('pointerdown',{isTrusted:true,target:{closest:()=>({tagName:'BUTTON'})}});assert.equal(captures,0);
 emit('pointerdown',gesture);assert.equal(captures,1);
 document.pointerLockElement=canvas;docListeners.get('pointerlockchange')();assert.equal(messages.at(-1).locked,true);
 emit('message',{source:parent,data:JSON.stringify({type:'hostPointerMode',enabled:false})});assert.equal(document.pointerLockElement,null);assert.equal(messages.at(-1).locked,false);
 emit('pointerdown',gesture);assert.equal(captures,1);
 assert.equal(acceptPlayerEvent(parent,parent,JSON.stringify({type:'webPointerLock',locked:'true'})),null);
 assert.equal(acceptPlayerEvent({},parent,JSON.stringify({type:'webPointerLock',locked:true})),null);
});
const runtimeSource=await readFile(new URL('../mcp/runtime/creator-v1.js',import.meta.url),'utf8');

function relayFixture({focused=false,onGameMessage=()=>{}}={}){
 const listeners=new Map(),frameListeners=new Map(),parentMessages=[],gameMessages=[],attributes=new Map();
 let focusCalls=0,removed=false;
 const parent={postMessage:message=>parentMessages.push(message)};
 const frame={focus(){},contentWindow:{focus:()=>focusCalls++,postMessage:message=>{gameMessages.push(message);onGameMessage(message);}},setAttribute:(key,value)=>attributes.set(key,value),addEventListener:(type,fn)=>frameListeners.set(type,fn),remove:()=>{removed=true;}};
 const document={hasFocus:()=>focused,createElement:()=>frame,body:{appendChild(){}}};
 runInNewContext(relaySource,{window:{},parent,document,addEventListener:(type,fn)=>listeners.set(type,fn)});
 const message=(data,source=parent)=>listeners.get('message')({source,data});
 const initialize=()=>message({type:'slop-player-init-v1',html:'<canvas></canvas>',csp:"default-src 'none';"});
 return {frame,parent,attributes,parentMessages,gameMessages,message,initialize,key:(type,event)=>listeners.get(type)(event),load:()=>frameListeners.get('load')(),focus:()=>listeners.get('focus')(),focusCalls:()=>focusCalls,removed:()=>removed};
}

test('relay sends host focus to the inner game without stealing focus during background load',()=>{
 const idle=relayFixture();idle.focus();assert.equal(idle.focusCalls(),0);
 idle.initialize();idle.load();assert.equal(idle.focusCalls(),0);
 idle.focus();assert.equal(idle.focusCalls(),1);
 assert.equal(JSON.parse(idle.gameMessages.at(-1)).type,'hostFocus');
 assert.equal(idle.attributes.get('sandbox'),'allow-scripts allow-pointer-lock');
 assert.equal(idle.attributes.has('credentialless'),true);
 const active=relayFixture({focused:true});active.initialize();active.focus();assert.equal(active.focusCalls(),0);
 active.load();assert.equal(active.focusCalls(),1);
});

test('relay refuses focus and messages after navigation and rejects unrelated message sources',()=>{
 const f=relayFixture();f.initialize();f.load();f.focus();assert.equal(f.focusCalls(),1);
 const delivered=f.gameMessages.length;
 f.message(JSON.stringify({type:'hostKey',key:'Space',down:true}),{});assert.equal(f.gameMessages.length,delivered);
 f.load();assert.equal(f.removed(),true);
 f.focus();assert.equal(f.focusCalls(),1);
 f.message(JSON.stringify({type:'hostKey',key:'Space',down:true}));assert.equal(f.gameMessages.length,delivered);
 assert.equal(JSON.parse(f.parentMessages.at(-1)).code,'main_frame_failure');
});

test('relay catches genuine key releases during nested focus handoff without forwarding shortcuts or synthetic events',()=>{
 const f=relayFixture();f.initialize();f.load();let prevented=0;
 const event={key:'w',code:'KeyW',keyCode:87,location:0,isTrusted:true,preventDefault:()=>prevented++};
 f.key('keyup',event);assert.equal(prevented,1);
 assert.deepEqual(JSON.parse(f.gameMessages.at(-1)),{type:'hostKey',down:false,key:'w',code:'KeyW',repeat:false,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,keyCode:87,location:0});
 const total=f.gameMessages.length;
 for(const extra of [{isTrusted:false},{code:'Tab',key:'Tab'},{ctrlKey:true},{metaKey:true}])f.key('keydown',{...event,...extra});
 assert.equal(f.gameMessages.length,total);assert.equal(prevented,1);
 f.key('keydown',event);assert.equal(JSON.parse(f.parentMessages.at(-1)).type,'webInteraction');
});

test('legacy documents become playable without an SDK ready message, but game code cannot forge the relay signal',()=>{
 const f=relayFixture();f.initialize();
 f.message('slop-player-loaded-v1',f.frame.contentWindow);assert.equal(f.parentMessages.length,0);
 f.load();const signal=f.parentMessages.at(-1),hostFrame={};
 assert.deepEqual(acceptPlayerEvent(hostFrame,hostFrame,signal),{type:'ready',source:'document'});
 assert.equal(acceptPlayerEvent({},hostFrame,signal),null);
 f.load();assert.equal(acceptPlayerEvent(hostFrame,hostFrame,f.parentMessages.at(-1)).type,'loadError');
});

test('nested relay forwards first Space and WASD presses, then native game releases allow another press',()=>{
 const listeners=new Map(),parent={postMessage(){}};
 const listen=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
 const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event);};
 const canvas={style:{},setAttribute(){},getContext:()=>({setTransform(){}}),addEventListener(){}};
 const document={hidden:false,addEventListener(){},documentElement:{style:{}},body:{style:{},appendChild(){}},createElement:()=>canvas,querySelector:()=>canvas};
 class KeyboardEvent {constructor(type,options){Object.assign(this,{type},options);}preventDefault(){}}
 const window={parent,addEventListener:listen,dispatchEvent:dispatch,innerWidth:360,innerHeight:640,requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 const context={window,parent,document,addEventListener:listen,dispatchEvent:dispatch,KeyboardEvent,requestAnimationFrame:()=>1};
 runInNewContext(bootstrapSource,context);runInNewContext(runtimeSource,context);window.Slop.create();
 const relay=relayFixture({onGameMessage:data=>dispatch({type:'message',source:parent,data})});relay.initialize();relay.load();relay.focus();assert.equal(relay.focusCalls(),1);
 for(const [key,code] of [[' ','Space'],['w','KeyW'],['a','KeyA'],['s','KeyS'],['d','KeyD']]){
  relay.message(JSON.stringify({type:'hostKey',key,code,down:true}));assert.equal(window.Slop.input.keys.has(code),true,code);
  dispatch(new KeyboardEvent('keyup',{key,code,isTrusted:true}));assert.equal(window.Slop.input.keys.has(code),false,code);
  dispatch(new KeyboardEvent('keydown',{key,code,isTrusted:true}));assert.equal(window.Slop.input.keys.has(code),true,code);
  dispatch(new KeyboardEvent('keyup',{key,code,isTrusted:true}));assert.equal(window.Slop.input.keys.has(code),false,code);
 }
});
