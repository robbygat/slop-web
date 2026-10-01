import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_WALL,HERO_FEATURED,HERO_WALL_GAMES,HERO_LIFT_MS,WALL_SPEED,wallCrop,tileY,liftWindow,nextLift,nextLiftInBand,liftPlacement,elapsedMs,liftClipTime,wallVideoSource} from '../src/lib/hero-wall.js';

const COLS=HERO_WALL.w/HERO_WALL.cellW;
test('every game appears exactly once on the wall',()=>{
 assert.equal(HERO_WALL_GAMES.length,COLS*6);
 assert.equal(new Set(HERO_WALL_GAMES.map(n=>n.toLowerCase())).size,HERO_WALL_GAMES.length);
});

test('featured games sit at their own wall cell, on upward even columns',()=>{
 assert.deepEqual(HERO_FEATURED.map(f=>f.name),['Kickflip Coast','Run Infinite','Aqua Slide','Cube Surfer','Stumble Run','Draw Climber']);
 for(const f of HERO_FEATURED){
  assert.equal(f.col%2,0);
  assert.equal(HERO_WALL_GAMES[f.row*COLS+f.col],f.name);
  assert.ok(f.phase>=0&&f.phase<HERO_WALL.tileLoop);
 }
});

test('a scheduled lift starts on the lift line with the tile whole for the entire ride',()=>{
 for(const line of [.68,.8])for(let t=0;t<15;t+=.37){
  const next=nextLift(t,line);assert.ok(next,'some featured game is always approaching');
  assert.ok(next.delay>=.35&&next.delay<=HERO_WALL.loop);
  const at=t+next.delay,{y,min,max}=liftWindow(line),place=liftPlacement(next.lift,at);
  assert.ok(Math.abs(place.y-y)<=WALL_SPEED/24+2,`arrives at the line (${place.y} vs ${y})`);
  for(let ms=0;ms<=HERO_LIFT_MS;ms+=1000/24){
   const top=tileY(next.lift.col,next.lift.row,at+ms/1000);
   assert.ok(top>=0&&top+HERO_WALL.tileH<=HERO_WALL.h,'never wraps across the wall edge');
  }
  assert.ok(place.y>=min-WALL_SPEED/24&&place.y<=max+WALL_SPEED/24);
 }
});

test('the ride distance equals the column travel during the lift',()=>{
 const place=liftPlacement(HERO_FEATURED[0],3);
 assert.ok(Math.abs(-place.ridePercent/100*HERO_WALL.tileH-WALL_SPEED*HERO_LIFT_MS/1000)<1e-9);
});

test('recently lifted games are skipped so lifts rotate through the featured set',()=>{
 const seen=new Set();let t=0,recent=[];
 for(let i=0;i<12;i++){const n=nextLift(t,.68,recent);seen.add(n.lift.id);recent=[...recent,n.lift.id].slice(-3);t+=n.delay+HERO_LIFT_MS/1000;}
 assert.equal(seen.size,HERO_FEATURED.length);
});

test('media-clock helpers cross the loop seam and stay phase-locked',()=>{
 assert.equal(elapsedMs(14.5,.5),1000);
 const f=HERO_FEATURED[0];
 assert.ok(Math.abs(liftClipTime(f,0)-f.phase)<1e-9);
 assert.ok(Math.abs(liftClipTime(f,15)-liftClipTime(f,0))<1e-9,'tile loop divides the wall loop');
 assert.equal(wallCrop(4,0)%2,0);
});

test('phones and constrained connections get the lighter wall',()=>{
 assert.equal(wallVideoSource({}),'/assets/brand/game-wall-hd.mp4');
 assert.equal(wallVideoSource({narrow:true}),'/assets/brand/game-wall.mp4');
 assert.equal(wallVideoSource({saveData:true}),'/assets/brand/game-wall.mp4');
 assert.equal(wallVideoSource({effectiveType:'3g'}),'/assets/brand/game-wall.mp4');
});

test('broken and landscape clips are not on the wall',()=>{
 for(const name of ['Hole Rush','Blocks','Neon Bastion','Rift Runner','Void Pong','Neon Pinball','Neon Velocity'])assert.ok(!HERO_WALL_GAMES.includes(name),name);
});

test('band lifts start inside the visible band, stay whole, and rotate sides and games',()=>{
 for(const [lo,hi] of [[.58,.8],[.7,.83]]){
  let t=.5,lastCol=null,recent=[];const cols=[],ids=new Set();
  for(let i=0;i<14;i++){
   const n=nextLiftInBand(t,lo,hi,{recent,avoidCol:lastCol});assert.ok(n&&n.delay<9,'a lift is never far away');
   const at=t+n.delay,y=tileY(n.lift.col,n.lift.row,at);
   assert.ok(y>=lo*HERO_WALL.h-WALL_SPEED/12&&y<=hi*HERO_WALL.h+WALL_SPEED/12,`starts in band (${y})`);
   for(let ms=0;ms<=HERO_LIFT_MS;ms+=1000/24){const top=tileY(n.lift.col,n.lift.row,at+ms/1000);assert.ok(top>=0&&top+HERO_WALL.tileH<=HERO_WALL.h);}
   cols.push(n.lift.col);ids.add(n.lift.id);lastCol=n.lift.col;recent=[...recent,n.lift.id].slice(-3);t=at+HERO_LIFT_MS/1000+.9;
  }
  assert.equal(ids.size,HERO_FEATURED.length);
  assert.ok(new Set(cols).size>1);
 }
});
