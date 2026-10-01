import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_WALL,HERO_LIFT_MS,findWallSlot,sampleWallLift,sampleWallRide,wallVideoSource} from '../src/lib/hero-wall.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
const hd=(slot,time)=>sampleWallLift(slot,time,2948,1536);

test('wall geometry matches the authored 22-column, six-row video loop',()=>{
 assert.deepEqual(HERO_WALL,{w:2948,h:1536,cellW:134,cellH:256,tileW:128,tileH:250,loop:15});
 assert.equal(HERO_LIFT_MS,5200);
});

test('actual decoded HD column 4 row 5 stays locked to its baked even-pixel crop',()=>{
 const found=findWallSlot(4,0,732/1536);
 assert.ok(found);
 assert.equal(found.col,4);assert.equal(found.row,5);assert.equal(found.initialY,732);
 const slot={...found,t:0},initial=hd(slot,0),quarter=hd(slot,.25),next=hd(slot,1);
 close(initial.source.x,536);close(initial.source.y,732);
 close(initial.source.width,128);close(initial.source.height,250);close(initial.offsetPercent,0);
 close(quarter.source.y,706);close(quarter.offsetPercent,-10.4);
 close(next.source.x,536);close(next.source.y,630);close(next.offsetPercent,-40.8);
 close(next.source.width,128);close(next.source.height,250);
 assert.deepEqual(slot,{...found,t:0});
});

test('crop dimensions and coordinates scale to the 1600 by 834 wall source',()=>{
 const slot={...findWallSlot(4,0,732/1536),t:0};
 for(const time of [0,1,5.2]){
  const full=hd(slot,time),small=sampleWallLift(slot,time,1600,834);
  close(small.source.x,536*1600/2948);
  close(small.source.y,full.source.y*834/1536);
  close(small.source.width,128*1600/2948);
  close(small.source.height,250*834/1536);
  close(small.offsetPercent,full.offsetPercent);
 }
});

test('media time 14.5 to 0.5 moves by one second across the loop seam',()=>{
 const slot={...findWallSlot(4,14.5,.68),t:14.5};
 const before=hd(slot,14.5),after=hd(slot,.5),unwrapped=hd(slot,15.5);
 close(before.source.y,1040);close(after.source.y,938);
 close(before.source.y-after.source.y,102);
 close(after.offsetPercent,-40.8);
 close(after.source.y,unwrapped.source.y);
 close(after.offsetPercent,unwrapped.offsetPercent);
 close(after.source.x,before.source.x);
});

test('chosen even-column tiles stay whole at every decoded frame throughout a 5200ms lift',()=>{
 const duration=HERO_LIFT_MS/1000;
 const elapsedFrames=[0,...Array.from({length:Math.floor(duration*24)},(_,index)=>(index+1)/24),duration];
 for(const col of [0,2,4,6,8,10,12,14,16,18,20]){
  for(const time of [0,.13,1,7.25,14.5,14.999,15,27.875]){
   for(const start of [.68,.8,732/1536]){
    const found=findWallSlot(col,time,start);
    assert.ok(found,`slot for column ${col} at ${time}`);
    assert.equal(found.col,col);assert.ok(Number.isInteger(found.row)&&found.row>=0&&found.row<6);
    assert.equal(found.initialY%2,0);close(found.top*1536/100,found.initialY);
    const slot={...found,t:time%15};
    let previousY=Infinity;
    for(const elapsed of elapsedFrames){
     const frameTime=(time+elapsed)%15,{source,offsetPercent}=hd(slot,frameTime);
     close(source.x,col*134);close(source.width,128);close(source.height,250);
     assert.ok(source.x>=0&&source.x+source.width<=2948);
     assert.equal(source.y%2,0,'HD crop remains on the baked even-pixel grid');
     assert.ok(source.y>=6,`top margin at column ${col}, time ${time}, elapsed ${elapsed}`);
     assert.ok(source.y+source.height<=1536-6,`bottom margin at column ${col}, time ${time}`);
     assert.ok(source.y<=previousY,'selected tile never wraps or moves backward');
     close(offsetPercent,(source.y-slot.initialY)/250*100);
     previousY=source.y;
    }
   }
  }
 }
});

test('whole-loop phases select the same slot and unsupported columns cannot start a lift',()=>{
 for(const col of [2,4,6,8]){
  const first=findWallSlot(col,2.25,.68),repeat=findWallSlot(col,17.25,.68);
  close(first.left,repeat.left);close(first.top,repeat.top);
 }
 for(const col of [-2,1,3,21,22,2.5,NaN,Infinity])assert.equal(findWallSlot(col,0,.68),null);
 for(const time of [NaN,Infinity])assert.equal(findWallSlot(4,time,.68),null);
 for(const start of [NaN,Infinity])assert.equal(findWallSlot(4,0,start),null);
});

test('a frame just before slot selection cannot become a full-loop jump',()=>{
 const slot={...findWallSlot(4,5,.68),t:5};
 const selected=hd(slot,5),sameFrame=hd(slot,4.98),priorFrame=hd(slot,5-1/24);
 close(sameFrame.source.y,selected.source.y);close(sameFrame.offsetPercent,0);
 close(priorFrame.source.y,selected.source.y+4);close(priorFrame.offsetPercent,1.6);
 close(priorFrame.source.x,selected.source.x);
 close(priorFrame.source.width,128);close(priorFrame.source.height,250);
 assert.ok(priorFrame.source.y+priorFrame.source.height<=1536);
});

test('normal phone and desktop connections share the HD wall source',()=>{
 const hdSource='/assets/brand/game-wall-hd.mp4';
 for(const hints of [undefined,{}, {width:375}, {width:1440}, {effectiveType:'4g'}, {effectiveType:'unknown'}, {effectiveType:''}]){
  assert.equal(wallVideoSource(hints),hdSource);
 }
});

test('save-data and constrained connections select the smaller wall source',()=>{
 const smallSource='/assets/brand/game-wall.mp4';
 for(const hints of [{saveData:true},{saveData:true,effectiveType:'4g'}, {effectiveType:'slow-2g'}, {effectiveType:'2g'}, {effectiveType:'3g'}]){
  assert.equal(wallVideoSource(hints),smallSource);
 }
});

test('airborne motion interpolates smoothly instead of using the even-pixel crop steps',()=>{
 const slot={...findWallSlot(4,0,732/1536),t:0};
 const frame={mediaTime:0,expectedDisplayTime:1000};
 const samples=[0,10,20,30].map(ms=>sampleWallRide(slot,frame,1000+ms,.5));
 for(let index=1;index<samples.length;index++){
  close(samples[index].offsetPercent-samples[index-1].offsetPercent,-.4096);
  close(samples[index].frameOffsetPercent,0);
 }
 const before=sampleWallRide(slot,frame,1000+1000/24,.5);
 const next=sampleWallRide(slot,{mediaTime:1/24,expectedDisplayTime:1000+1000/24},1000+1000/24,.5);
 close(before.offsetPercent,next.offsetPercent);
 assert.notEqual(before.frameOffsetPercent,next.frameOffsetPercent);
});

test('smooth ride crosses the video loop seam without changing the selected tile row',()=>{
 const slot={...findWallSlot(4,14.5,.68),t:14.5};
 const before=sampleWallRide(slot,{mediaTime:15-1/24,expectedDisplayTime:1000},1000+1000/24,.5);
 const after=sampleWallRide(slot,{mediaTime:0,expectedDisplayTime:1000+1000/24},1000+1000/24,.5);
 close(before.offsetPercent,after.offsetPercent);
});

test('stalled or early frame clocks cannot extrapolate beyond one source frame',()=>{
 const slot={...findWallSlot(4,0,732/1536),t:0},frame={mediaTime:0,expectedDisplayTime:1000};
 const atFrame=sampleWallRide(slot,frame,1000,.5);
 const early=sampleWallRide(slot,frame,990,.5);
 const bounded=sampleWallRide(slot,frame,1000+1000/24,.5);
 const stalled=sampleWallRide(slot,frame,9000,.5);
 close(early.offsetPercent,atFrame.offsetPercent);
 close(stalled.offsetPercent,bounded.offsetPercent);
 close(stalled.offsetPercent,-102.4/24/250*100);
 close(sampleWallRide(slot,frame,9000,.5,0).offsetPercent,atFrame.offsetPercent);
});

test('launch and landing use the exact decoded frame even when selection chose a later frame',()=>{
 const slot={...findWallSlot(4,.028,732/1536),t:.028},frame={mediaTime:0,expectedDisplayTime:1000};
 const exact=hd(slot,0);
 assert.equal(exact.source.y,732);
 for(const progress of [0,.03,.06,.88,.92,1]){
  const ride=sampleWallRide(slot,frame,1015,progress);
  close(ride.offsetPercent,exact.offsetPercent);close(ride.frameOffsetPercent,exact.offsetPercent);
 }
});
