import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installLegacyKeyboard,legacyControlSpec,auditedCursorStyle} from '../src/lib/player-input.js';
import {acceptPlayerEvent} from '../src/lib/player-contracts.js';
function fixture(mode) {
 const listeners={},events=[],rafs=new Map();let n=0;
 class Element {setPointerCapture(id){events.push(['capture',id]);}}
 class PointerEvent {constructor(type,values){Object.assign(this,{type},values);}}
 const canvas=new Element();Object.assign(canvas,{clientWidth:360,clientHeight:640,hasAttribute:()=>false,setAttribute(){},getBoundingClientRect:()=>({left:0,top:0,width:360,height:640}),dispatchEvent:e=>{events.push(e);canvas.setPointerCapture(e.pointerId);}});
 const doc={hidden:false,querySelectorAll:()=>[canvas],addEventListener:(type,fn)=>{listeners['doc:'+type]=fn;},createElement:()=>({style:{},setAttribute(){}}),body:{appendChild(){}}};
 const target={document:doc,parent:{},Element,PointerEvent,getComputedStyle:()=>({pointerEvents:'auto'}),matchMedia:()=>({matches:true}),addEventListener:(type,fn)=>{listeners[type]=fn;},requestAnimationFrame:fn=>{rafs.set(++n,fn);return n;},cancelAnimationFrame:id=>rafs.delete(id)};
 vm.runInNewContext(`(${installLegacyKeyboard.toString()})(${JSON.stringify({mode})}, target)`,{target,Set});
 const key=(name,extra={})=>{const e={key:name,code:name,isTrusted:true,target:{},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};listeners.keydown?.(e);return e;};
 return{target,listeners,events,rafs,key,canvas};
}
test('legacy controls are exact-bundle opt-ins; new or re-released games retain authored keyboard behavior',()=>{
 const url='https://api.slop.game/storage/v1/object/public/games/flappy-duck-7prm/1.0.0/index.html';assert.equal(legacyControlSpec(url).mode,'tap');assert.equal(legacyControlSpec(url.replace('1.0.0','2.0.0')),null);assert.equal(legacyControlSpec('https://evil.test/flappy-duck-7prm'),null);
});
test('tap bridge consumes only genuine desktop primary keys, respects handled keys, and never steals editable input',()=>{
 const f=fixture('tap');for(const extra of [{isTrusted:false},{defaultPrevented:true},{ctrlKey:true},{repeat:true},{target:{closest:()=>true}}])f.key('Space',extra);
 f.key('ArrowLeft');assert.equal(f.events.length,0);f.target.matchMedia=()=>({matches:false});f.key('Space');assert.equal(f.events.length,0);
 f.target.matchMedia=()=>({matches:true});assert.equal(f.key('Space').defaultPrevented,true);assert.deepEqual(f.events.map(e=>e.type),['pointerdown','pointerup']);f.canvas.setPointerCapture(7);assert.deepEqual(f.events.at(-1),['capture',7]);
});
test('swipe and drag adapters preserve their audited pointer contracts and stop on host pause',()=>{
 const s=fixture('swipe');s.key('ArrowLeft');assert.deepEqual(s.events.map(e=>e.type),['pointerdown','pointermove','pointerup']);assert.ok(s.events[1].clientX<s.events[0].clientX);
 const d=fixture('drag');d.key('ArrowRight');assert.equal(d.events[0].type,'pointerdown');[...d.rafs.values()][0](16);assert.equal(d.events[1].type,'pointermove');assert.ok(d.events[1].clientX>d.events[0].clientX);
 d.listeners.message({source:{},data:'{"type":"pause"}'});const before=d.events.length;d.listeners.message({source:d.target.parent,data:'{"type":"pause"}'});assert.equal(d.events.at(-1).type,'pointerup');d.key('ArrowRight');assert.equal(d.events.length,before+1);
});
test('player accepts only bounded SDK results from its own current frame',()=>{
 const frame={};assert.deepEqual(acceptPlayerEvent(frame,frame,'{"type":"finished","score":93}'),{type:'finished',score:93});assert.deepEqual(acceptPlayerEvent(frame,frame,'{"type":"finished"}'),{type:'finished'});
 for(const score of [-1,1.5,1e8,'93'])assert.equal(acceptPlayerEvent(frame,frame,JSON.stringify({type:'finished',score})),null);assert.equal(acceptPlayerEvent({},frame,'{"type":"finished","score":93}'),null);assert.equal(acceptPlayerEvent(frame,frame,'[]'),null);
});

test('painted cursor fixes bind audited immutable originals and leave menus and other games alone',()=>{
 const zombies='https://api.slop.game/storage/v1/object/public/games/releases/b63e8ee36d570cd184982fa331f7b62a47eff1e4b63a9ec22c044a164c8e5637/sloppy-zombies-desktop/1.0.0/index.html';
 assert.equal(auditedCursorStyle(zombies),'canvas{cursor:none!important}');
 assert.equal(auditedCursorStyle(zombies.replace('1.0.0','2.0.0')),'');
 assert.equal(auditedCursorStyle(zombies.replace('api.slop.game','evil.test')),'');
 assert.equal(auditedCursorStyle('https://api.slop.game/storage/v1/object/public/games/a-new-game/1.0.0/index.html'),'');
});
