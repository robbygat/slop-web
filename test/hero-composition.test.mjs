import test from 'node:test';
import assert from 'node:assert/strict';
import {heroComposition} from '../src/lib/hero-composition.js';

test('the hero cast fits its frame at phone, tablet and desktop sizes',()=>{
 const seats=[247,293,339,25,155,201].map(d=>d*Math.PI/180);
 for(const [w,h] of [[288,415],[320,415],[390,415],[480,510],[560,510],[680,620],[850,700]]){
  const f=heroComposition(w,h),k=f.scale;
  const boxes=[{x:f.x,y:f.y,w:284*k,h:222*k},...seats.map(a=>({x:f.x+(1000+278*Math.cos(a)-978)*k,y:f.y+(382+206*Math.sin(a)-402)*k,w:146*k*1.15,h:140*k*1.15}))];
  for(const b of boxes){assert.ok(b.x-b.w/2>=0,`left at ${w}`);assert.ok(b.x+b.w/2<=w,`right at ${w}`);assert.ok(b.y-b.h/2>=0,`top at ${w}`);assert.ok(b.y+b.h/2<=h-f.bottom,`body clearance at ${w}`);}
 }
});
