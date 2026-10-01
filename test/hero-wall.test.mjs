import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_WALL,HERO_FEATURED,HERO_WALL_GAMES,HERO_LIFT_MS,WALL_SPEED,hasRunway,tileY,liftWindow,nextLiftInBand,liftPlacement,liftClipTime,wallVideoStem} from '../src/lib/hero-wall.js';

const COLS=HERO_WALL.w/HERO_WALL.cellW;

test('every game appears exactly once on the wall',()=>{
 assert.equal(HERO_WALL_GAMES.length,COLS*6);
 assert.equal(new Set(HERO_WALL_GAMES.map(n=>n.toLowerCase())).size,HERO_WALL_GAMES.length);
});

test('broken and landscape clips are not on the wall',()=>{
 for(const name of ['Hole Rush','Blocks','Neon Bastion','Rift Runner','Void Pong','Neon Pinball','Neon Velocity'])assert.ok(!HERO_WALL_GAMES.includes(name),name);
});

test('featured games sit at their own cell on upward even columns spread left, center and right',()=>{
 assert.deepEqual(HERO_FEATURED.map(f=>f.name),['Kickflip Coast','Run Infinite','Aqua Slide','Cube Surfer','Join Clash 3D','Draw Climber']);
 for(const f of HERO_FEATURED){
  assert.equal(f.col%2,0);
  assert.equal(HERO_WALL_GAMES[f.row*COLS+f.col],f.name);
  assert.ok(f.phase>=0&&f.phase<HERO_WALL.tileLoop);
 }
});

test('tile position matches the shader: an even column moves up at wall speed and wraps',()=>{
 const y0=tileY(2,0,1),y1=tileY(2,0,1.5);
 assert.ok(Math.abs(((y0-y1+HERO_WALL.h)%HERO_WALL.h)-WALL_SPEED*.5)<1e-6);
 assert.ok(Math.abs(tileY(2,0,0)-tileY(2,0,HERO_WALL.loop))<1e-6);
});

test('band lifts start inside the band, stay whole for the ride, and rotate sides and games',()=>{
 for(const [lo,hi] of [[.58,.8],[.4,.56]]){
  let t=.5,lastCol=null,recent=[];const cols=[],ids=new Set();
  for(let i=0;i<14;i++){
   const n=nextLiftInBand(t,lo,hi,{recent,avoidCol:lastCol});assert.ok(n&&n.delay<9,'a lift is never far away');
   const at=t+n.delay,y=tileY(n.lift.col,n.lift.row,at),{min,max}=liftWindow();
   assert.ok(y>=Math.max(min,lo*HERO_WALL.h)-1&&y<=Math.min(max,hi*HERO_WALL.h)+1,`starts in band (${y})`);
   for(let ms=0;ms<=HERO_LIFT_MS;ms+=16){const top=tileY(n.lift.col,n.lift.row,at+ms/1000);assert.ok(top>=0&&top+HERO_WALL.tileH<=HERO_WALL.h,'never wraps');}
   cols.push(n.lift.col);ids.add(n.lift.id);lastCol=n.lift.col;recent=[...recent,n.lift.id].slice(-3);t=at+HERO_LIFT_MS/1000+.9;
  }
  assert.equal(ids.size,HERO_FEATURED.length);
  assert.ok(new Set(cols).size>1);
 }
});

test('lift placement is in plane percentages and the clip is phase-locked to the wall loop',()=>{
 const f=HERO_FEATURED[0],p=liftPlacement(f,2);
 assert.ok(Math.abs(p.top-tileY(f.col,f.row,2)/HERO_WALL.h*100)<1e-9);
 assert.ok(Math.abs(p.width-HERO_WALL.tileW/HERO_WALL.w*100)<1e-9);
 assert.ok(Math.abs(liftClipTime(f,0)-f.phase)<1e-9);
 assert.ok(Math.abs(liftClipTime(f,HERO_WALL.tileLoop)-liftClipTime(f,0))<1e-9);
});

test('phones and constrained connections get the lighter wall',()=>{
 assert.equal(wallVideoStem({}),'/assets/brand/game-wall-hd');
 assert.equal(wallVideoStem({narrow:true}),'/assets/brand/game-wall');
 assert.equal(wallVideoStem({saveData:true}),'/assets/brand/game-wall');
});

test('lifted takes never loop: a lift only starts with enough runway to land',()=>{
 for(const f of HERO_FEATURED)assert.ok(f.runway>=HERO_LIFT_MS/1000+1.5,`${f.id} take is long enough`);
 for(let v=0;v<6;v+=.05){
  const n=nextLiftInBand(v*2,.58,.8,{videoTime:v});if(!n)continue;
  assert.ok(hasRunway(n.lift,v+n.delay));
  assert.ok(liftClipTime(n.lift,v+n.delay)+HERO_LIFT_MS/1000<=n.lift.runway);
 }
});
