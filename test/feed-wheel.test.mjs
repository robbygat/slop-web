import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedWheel} from '../src/lib/feed-wheel.js';
function rig(){let time=0,prevented=0;const moves=[];const handle=createFeedWheel({move:d=>moves.push(d),now:()=>time});return {moves,event:(deltaY,at,extra={})=>{time=at;return handle({deltaY,preventDefault:()=>prevented++,...extra});},get prevented(){return prevented;}};}
test('a long trackpad inertia tail cannot fly past several games',()=>{
 const r=rig();for(let t=0;t<1000;t+=20)r.event(t<100?12:2,t);
 assert.deepEqual(r.moves,[1]);r.event(60,1250);assert.deepEqual(r.moves,[1,1]);
});
test('new deliberate gestures work in either direction and mouse line deltas work',()=>{
 const r=rig();r.event(3,0,{deltaMode:1});r.event(-3,700,{deltaMode:1});r.event(1,1400,{deltaMode:2});assert.deepEqual(r.moves,[1,-1,1]);
});
test('pinch zoom and horizontal gestures are not captured by the feed',()=>{
 const r=rig();assert.equal(r.event(90,0,{ctrlKey:true}),false);assert.equal(r.event(30,10,{deltaX:90}),false);assert.equal(r.prevented,0);assert.deepEqual(r.moves,[]);
});
