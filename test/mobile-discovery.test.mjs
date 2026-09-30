import test from 'node:test';
import assert from 'node:assert/strict';
import {lightHero,HERO_CAST,HERO_SEATS,swapHeroSeat} from '../src/lib/hero-policy.js';
import {appendCatalogPage} from '../src/lib/catalog-window.js';
import {createPreviewPool} from '../src/lib/preview-pool.js';

test('phones, touch devices and constrained connections avoid automatic WebGL hero loading',()=>{
 for(const hints of [{compact:true},{coarse:true},{saveData:true},{effectiveType:'2g'},{effectiveType:'3g'}])assert.equal(lightHero(hints),true);
 assert.equal(lightHero({compact:false,coarse:false,effectiveType:'4g'}),false);
});
test('mobile character swaps retain every character and every target stays inside the frame',()=>{
 let order=HERO_CAST;
 for(const id of [...HERO_CAST,...HERO_CAST].reverse()){order=swapHeroSeat(order,id);assert.equal(order[0],id);assert.deepEqual([...order].sort(),[...HERO_CAST].sort());}
 for(const [w,h] of [[282,275],[343,312],[528,370],[680,620]])for(const p of HERO_SEATS){
  const radius=w*p.size/200;
  assert.ok(w*p.x/100-radius>=0);assert.ok(w*p.x/100+radius<=w);
  assert.ok(h*p.y/100-radius>=0);assert.ok(h*p.y/100+radius<=h);
 }
});
const phone=id=>({id,slug:id,name:id,supported_platforms:['mobile'],preview_width:360,preview_height:640});
const wide=id=>({...phone(id),supported_platforms:['desktop'],preview_width:1280,preview_height:720});
test('arriving game pages do not move earlier tiles or reinsert a promoted game',()=>{
 const kick={...phone('kick'),name:'Kickflip Coast'};
 const first=appendCatalogPage([],Array.from({length:24},(_,i)=>phone('phone-'+i)).concat(kick),{featureKickflip:true});
 assert.equal(first[2].id,'kick');
 const next=appendCatalogPage(first,[wide('wide-1'),kick,phone('phone-24'),wide('wide-2')]);
 assert.deepEqual(next.slice(0,first.length),first);assert.equal(new Set(next.map(g=>g.id)).size,next.length);assert.equal(next.length,first.length+3);
});
test('shrinking the phone video budget releases decoders without losing hovered priority',()=>{
 const pool=createPreviewPool(4),states=Array(6).fill(false),handles=states.map((_,i)=>pool.register(i,v=>states[i]=v));
 handles.forEach(h=>h.set(true));handles[5].set(true,10);assert.equal(pool.activeCount,4);
 pool.setLimit(2);assert.equal(pool.activeCount,2);assert.equal(states[5],true);assert.equal(states.filter(Boolean).length,2);
 handles[5].release();assert.equal(pool.activeCount,2);assert.equal(states[5],false);
 handles.forEach(h=>h.release());assert.equal(pool.activeCount,0);
});
