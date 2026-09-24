import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const relaySource=await readFile(new URL('../public/game-frame/relay.js',import.meta.url),'utf8');
const bootstrapSource=await readFile(new URL('../src/lib/player-bootstrap.js',import.meta.url),'utf8');
const runtimeSource=await readFile(new URL('../mcp/runtime/creator-v1.js',import.meta.url),'utf8');

function relayFixture({focused=false,onGameMessage=()=>{}}={}){
 const listeners=new Map(),frameListeners=new Map(),parentMessages=[],gameMessages=[],attributes=new Map();
 let focusCalls=0,removed=false;
 const parent={postMessage:message=>parentMessages.push(message)};
 const frame={contentWindow:{focus:()=>focusCalls++,postMessage:message=>{gameMessages.push(message);onGameMessage(message);}},setAttribute:(key,value)=>attributes.set(key,value),addEventListener:(type,fn)=>frameListeners.set(type,fn),remove:()=>{removed=true;}};
 const document={hasFocus:()=>focused,createElement:()=>frame,body:{appendChild(){}}};
 runInNewContext(relaySource,{window:{},parent,document,addEventListener:(type,fn)=>listeners.set(type,fn)});
 const message=(data,source=parent)=>listeners.get('message')({source,data});
 const initialize=()=>message({type:'slop-player-init-v1',html:'<canvas></canvas>',csp:"default-src 'none';"});
 return {frame,parent,attributes,parentMessages,gameMessages,message,initialize,load:()=>frameListeners.get('load')(),focus:()=>listeners.get('focus')(),focusCalls:()=>focusCalls,removed:()=>removed};
}

test('relay sends host focus to the inner game without stealing focus during background load',()=>{
 const idle=relayFixture();idle.focus();assert.equal(idle.focusCalls(),0);
 idle.initialize();idle.load();assert.equal(idle.focusCalls(),0);
 idle.focus();assert.equal(idle.focusCalls(),1);
 assert.equal(idle.attributes.get('sandbox'),'allow-scripts allow-pointer-lock');
 assert.equal(idle.attributes.has('credentialless'),true);
 const active=relayFixture({focused:true});active.initialize();active.focus();assert.equal(active.focusCalls(),0);
 active.load();assert.equal(active.focusCalls(),1);
});

test('relay refuses focus and messages after navigation and rejects unrelated message sources',()=>{
 const f=relayFixture();f.initialize();f.load();f.focus();assert.equal(f.focusCalls(),1);
 f.message(JSON.stringify({type:'hostKey',key:'Space',down:true}),{});assert.equal(f.gameMessages.length,0);
 f.load();assert.equal(f.removed(),true);
 f.focus();assert.equal(f.focusCalls(),1);
 f.message(JSON.stringify({type:'hostKey',key:'Space',down:true}));assert.equal(f.gameMessages.length,0);
 assert.equal(JSON.parse(f.parentMessages.at(-1)).code,'main_frame_failure');
});

test('host keydown followed by native game keyup releases creator-v1 input and allows another press',()=>{
 const listeners=new Map(),parent={postMessage(){}};
 const listen=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
 const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event);};
 const canvas={style:{},setAttribute(){},getContext:()=>({setTransform(){}}),addEventListener(){}};
 const document={hidden:false,addEventListener(){},documentElement:{style:{}},body:{style:{},appendChild(){}},createElement:()=>canvas};
 class KeyboardEvent {constructor(type,options){Object.assign(this,{type},options);}preventDefault(){}}
 const window={parent,addEventListener:listen,dispatchEvent:dispatch,innerWidth:360,innerHeight:640,requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
 const context={window,parent,document,addEventListener:listen,dispatchEvent:dispatch,KeyboardEvent,requestAnimationFrame:()=>1};
 runInNewContext(bootstrapSource,context);runInNewContext(runtimeSource,context);window.Slop.create();
 const relay=relayFixture({onGameMessage:data=>dispatch({type:'message',source:parent,data})});relay.initialize();relay.load();relay.focus();assert.equal(relay.focusCalls(),1);
 relay.message(JSON.stringify({type:'hostKey',key:'Space',down:true}));assert.equal(window.Slop.input.keys.has('Space'),true);
 dispatch(new KeyboardEvent('keyup',{key:' ',code:'Space',isTrusted:true}));assert.equal(window.Slop.input.keys.has('Space'),false);
 dispatch(new KeyboardEvent('keydown',{key:' ',code:'Space',isTrusted:true}));assert.equal(window.Slop.input.keys.has('Space'),true);
 dispatch(new KeyboardEvent('keyup',{key:' ',code:'Space',isTrusted:true}));assert.equal(window.Slop.input.keys.has('Space'),false);
});
