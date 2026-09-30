import test from 'node:test';
import assert from 'node:assert/strict';
import {heroComposition,heroPosterLayout} from '../src/lib/hero-composition.js';

test('the complete 3D hero cast fits phone, tablet and desktop frames',()=>{
 const seats=[247,293,339,25,155,201].map(d=>d*Math.PI/180);
 for(const [w,h] of [[288,290],[320,330],[350,340],[390,360],[480,400],[620,500],[680,445],[850,700]]){
  const f=heroComposition(w,h),k=f.scale;
  assert.equal(f.bottom,0);
  const boxes=[{x:f.x,y:f.y,w:284*k,h:222*k},...seats.map(a=>({x:f.x+(1000+278*Math.cos(a)-978)*k,y:f.y+(382+206*Math.sin(a)-402)*k,w:146*k*1.15,h:140*k*1.15}))];
  for(const b of boxes){assert.ok(b.x-b.w/2>=0,`left at ${w}`);assert.ok(b.x+b.w/2<=w,`right at ${w}`);assert.ok(b.y-b.h/2>=0,`top at ${w}`);assert.ok(b.y+b.h/2<=h,`bottom at ${w}`);}
 }
});
test('the progressive poster retains every cast member and matches the 3D centre',()=>{
 for(const [w,h] of [[350,340],[620,500]]){
  const frame=heroComposition(w,h),poster=heroPosterLayout(w,h);
  assert.equal(poster.length,7);assert.equal(new Set(poster.map(p=>p.id)).size,7);
  assert.equal(poster[0].x/100*w,frame.x);assert.equal(poster[0].y/100*h,frame.y);
  for(const p of poster){assert.ok(p.x>0&&p.x<100);assert.ok(p.y>0&&p.y<100);assert.ok(p.size>0&&p.size<w);}
 }
});
