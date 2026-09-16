import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {installGameStorage} from '../src/lib/player-storage.js';
function opaqueWindow(){
 const target={};for(const name of ['localStorage','sessionStorage'])Object.defineProperty(target,name,{configurable:true,get(){throw new DOMException('The document is sandboxed and lacks allow-same-origin.','SecurityError');}});return target;
}
test('legacy game startup can use storage inside an opaque sandbox without reading host storage',()=>{
 const frame=opaqueWindow();assert.throws(()=>frame.localStorage.getItem('ducky_drift_best'),{name:'SecurityError'});
 // Execute the same standalone serialization used before untrusted game code.
 runInNewContext(`(${installGameStorage.toString()})();`,{window:frame,DOMException});
 let best=+frame.localStorage.getItem('ducky_drift_best')||0;assert.equal(best,0);
 best=7;frame.localStorage.setItem('ducky_drift_best',String(best));assert.equal(frame.localStorage.getItem('ducky_drift_best'),'7');
 assert.throws(()=>Object.defineProperty(frame,'localStorage',{value:{}}),TypeError);
});
test('game storage is bounded, separate per frame and session, and handles property-style legacy games',()=>{
 const a=opaqueWindow(),b=opaqueWindow();installGameStorage(a);installGameStorage(b);
 a.localStorage.best=9;assert.equal(a.localStorage.getItem('best'),'9');assert.equal(a.localStorage.length,1);
 assert.equal(a.localStorage.key(0),'best');assert.deepEqual(Object.keys(a.localStorage),['best']);
 assert.equal(b.localStorage.getItem('best'),null);assert.equal(a.sessionStorage.getItem('best'),null);
 a.localStorage.setItem('__proto__','inert value');assert.equal(a.localStorage.getItem('__proto__'),'inert value');assert.equal(Object.getPrototypeOf(a.localStorage),null);
 assert.throws(()=>a.localStorage.setItem('oversized','x'.repeat(512*1024)),{name:'QuotaExceededError'});
 assert.equal(a.localStorage.getItem('oversized'),null);assert.equal(a.localStorage.getItem('best'),'9');
 delete a.localStorage.best;assert.equal(a.localStorage.getItem('best'),null);a.localStorage.clear();assert.equal(a.localStorage.length,0);
});
