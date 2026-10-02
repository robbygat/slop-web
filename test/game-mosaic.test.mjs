import test from 'node:test';
import assert from 'node:assert/strict';
import {gameMosaic,landscapeGame} from '../src/lib/game-mosaic.js';

const phone=id=>({id,supported_platforms:['mobile'],preview_width:360,preview_height:640});
const desktop=id=>({id,supported_platforms:['desktop'],preview_width:640,preview_height:360});
test('the mixed wall retains every game and both format rankings, beyond the old 132-title size',()=>{
  const phones=Array.from({length:181},(_,i)=>phone(`m${i}`));
  const wide=Array.from({length:13},(_,i)=>desktop(`d${i}`));
  const original=[...phones,...wide],wall=gameMosaic(original);
  assert.equal(wall.length,194);assert.equal(new Set(wall.map(g=>g.id)).size,194);
  assert.deepEqual(wall.filter(landscapeGame),wide);
  assert.deepEqual(wall.filter(g=>!landscapeGame(g)),phones);
  assert.ok(wall.indexOf(wide[0])<12);
  assert.deepEqual(original,[...phones,...wide]);
});
test('empty and single-format catalogs work and short mixed catalogs terminate without lost games',()=>{
  for(const games of [[],[phone('p')],[desktop('d')],[phone('p'),desktop('a'),desktop('b')],[...Array.from({length:20},(_,i)=>phone(i)),desktop('d')]]){
    const wall=gameMosaic(games);assert.equal(wall.length,games.length);assert.deepEqual(new Set(wall.map(g=>g.id)),new Set(games.map(g=>g.id)));
  }
});
test('explicit portrait previews remain portrait even for a desktop target',()=>{
  assert.equal(landscapeGame(desktop('d')),true);
  assert.equal(landscapeGame({...desktop('d'),preview_width:360,preview_height:640}),false);
  assert.equal(landscapeGame({supported_platforms:['desktop']}),true);
  assert.equal(landscapeGame({supported_platforms:['mobile','desktop']}),false);
});
test('cross-play games share mobile cards and preview dimensions',async()=>{
  const {gameFormat}=await import('../src/lib/game-format.js');
  const mobile=phone('phone'),crossPlay={...mobile,id:'both',supported_platforms:['mobile','desktop']};
  assert.equal(landscapeGame(crossPlay),false);
  assert.deepEqual(gameFormat(crossPlay),gameFormat(mobile));
  assert.deepEqual(gameMosaic([mobile,crossPlay,desktop('desktop')]).filter(g=>!landscapeGame(g)),[mobile,crossPlay]);
});
test('newest keeps chronological order and features Kickflip once without disturbing other games',()=>{
 const games=[phone('new-1'),desktop('new-2'),phone('new-3'),desktop('new-4'),{...phone('coast'),name:'Kickflip Coast'},phone('older')];
 assert.deepEqual(gameMosaic(games,{preserveOrder:true}),games);
 const wall=gameMosaic(games,{preserveOrder:true,featureKickflip:true});
 assert.equal(wall[2].id,'coast');assert.equal(wall.length,games.length);
 assert.deepEqual(wall.filter(g=>g.id!=='coast'),games.filter(g=>g.id!=='coast'));
 assert.equal(games[4].id,'coast');
});

test('current phone videos win over old landscape thumbnail metadata',async()=>{
 const {gameFormat}=await import('../src/lib/game-format.js');
 const game={...phone('coast'),name:'Kickflip Coast',preview_width:1280,preview_height:720,preview_video:{video_path:'11111111-2222-4333-8444-555555555555/v1-0123456789abcdef0123456789abcdef/preview.mp4',poster_path:'11111111-2222-4333-8444-555555555555/v1-0123456789abcdef0123456789abcdef/poster.jpg',width:720,height:1280}};
 assert.equal(landscapeGame(game),false);assert.equal(gameFormat(game).orientation,'portrait');assert.equal(gameFormat(game).playerAspect,9/19.5);
 const wide={...game,supported_platforms:['desktop'],preview_video:{...game.preview_video,width:1280,height:720}};
 assert.equal(landscapeGame(wide),true);assert.equal(gameFormat(wide).orientation,'landscape');
});
