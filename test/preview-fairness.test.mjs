import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewPool} from '../src/lib/preview-pool.js';
function setup(limit,count){
 const timers=new Map();let id=0;const states=Array(count).fill(false),seen=new Set(),transitions=[];
 const pool=createPreviewPool(limit,{setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
 const handles=states.map((_,index)=>pool.register(index,active=>{states[index]=active;if(active)seen.add(index);transitions.push([index,active]);assert.ok(states.filter(Boolean).length<=limit);}));
 const tick=()=>{assert.equal(timers.size,1);const [key,fn]=timers.entries().next().value;timers.delete(key);fn();};
 return {pool,handles,states,seen,timers,tick,transitions};
}
test('rightmost visible cards get decoder time without scrolling or mouse movement',()=>{
 const s=setup(4,15);s.handles.forEach(h=>h.set(true));
 assert.deepEqual([...s.seen],[0,1,2,3]);
 for(let i=0;i<3;i++)s.tick();
 assert.equal(s.seen.size,15);assert.equal(s.pool.activeCount,4);
 s.handles.forEach(h=>h.release());assert.equal(s.timers.size,0);
});
test('hover and keyboard focus keep their card playing while the rest rotate',()=>{
 const s=setup(3,10);s.handles.forEach(h=>h.set(true));s.handles[9].set(true,10);
 for(let i=0;i<5;i++){s.tick();assert.equal(s.states[9],true);assert.equal(s.pool.activeCount,3);}
 assert.equal(s.seen.size,10);s.handles.forEach(h=>h.release());
});
test('leaving the screen frees a slot immediately and empty/paused pages stop the rotation clock',()=>{
 const s=setup(2,8);s.handles.forEach(h=>h.set(true));s.handles[0].set(false);
 assert.equal(s.states[0],false);assert.equal(s.states[2],true);
 s.handles.forEach(h=>h.set(false));assert.equal(s.pool.activeCount,0);assert.equal(s.timers.size,0);
 s.handles[7].set(true);assert.equal(s.states[7],true);assert.equal(s.timers.size,0);
 s.handles.forEach(h=>h.release());
});
test('rotation pauses displaced players before starting their replacements',()=>{
 const s=setup(2,6);s.handles.forEach(h=>h.set(true));s.transitions.length=0;s.tick();
 assert.deepEqual(s.transitions.map(([,active])=>active),[false,false,true,true]);
 s.handles.forEach(h=>h.release());
});
