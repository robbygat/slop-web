import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedReturnStore} from '../src/lib/feed-return.js';
const games=Array.from({length:140},(_,i)=>({id:`g${i}`,slug:`game-${i}`,created_at:'2026-09-30T00:00:00Z',qualified_play_count:140-i}));
test('returning to Play keeps the current game, filters and continuation',()=>{
 const store=createFeedReturnStore();const next={slug:'older',created_at:'2026-09-29T00:00:00Z',plays:1};
 assert.equal(store.write({order:'popular',platform:'mobile',games:games.slice(0,12),active:'g8',next}),true);
 const read=store.read();assert.equal(read.active,'g8');assert.equal(read.platform,'mobile');assert.equal(read.order,'popular');assert.deepEqual(read.next,next);
 read.games.pop();assert.equal(store.read().games.length,12);
});
test('a bounded return window advances from its actual last game without skipping omitted rows',()=>{
 const store=createFeedReturnStore();store.write({order:'popular',platform:'all',games,active:'g40',next:null});
 const read=store.read();assert.equal(read.games.length,96);assert.ok(read.games.some(g=>g.id===read.active));
 const last=read.games.at(-1);assert.deepEqual(read.next,{slug:last.slug,created_at:last.created_at,plays:last.qualified_play_count});
 const tail=createFeedReturnStore();tail.write({order:'newest',platform:'all',games,active:'g139',next:null});assert.equal(tail.read().next,null);
});
test('expired or invalid return state cannot replace fresh discovery',()=>{
 let time=0;const store=createFeedReturnStore({now:()=>time});assert.equal(store.read(),null);
 assert.equal(store.write({order:'broken',platform:'all',games,active:'g1'}),false);
 assert.equal(store.write({order:'newest',platform:'all',games,active:'missing'}),false);
 store.write({order:'newest',platform:'all',games,active:'g1',next:null});time=300001;assert.equal(store.read(),null);
});


test('Cross-play restores the same game, ordering and cursor after opening details',()=>{
 for(const order of ['newest','popular']){
  const store=createFeedReturnStore(),next={slug:'older-both',created_at:'2026-09-29T00:00:00Z',plays:4};
  assert.equal(store.write({order,platform:'cross-play',games:games.slice(0,12),active:'g8',next}),true);
  const context=store.read();assert.equal(context.platform,'cross-play');assert.equal(context.order,order);assert.equal(context.active,'g8');assert.deepEqual(context.games,games.slice(0,12));assert.deepEqual(context.next,next);
 }
});
test('a bounded Cross-play return window continues from its actual last game',()=>{
 const store=createFeedReturnStore();assert.equal(store.write({order:'popular',platform:'cross-play',games,active:'g40',next:null}),true);
 const context=store.read(),last=context.games.at(-1);
 assert.equal(context.platform,'cross-play');assert.equal(context.games.length,96);assert.ok(context.games.some(game=>game.id===context.active));
 assert.deepEqual(context.next,{slug:last.slug,created_at:last.created_at,plays:last.qualified_play_count});
});
test('unsupported platform return states cannot overwrite a saved Cross-play context',()=>{
 const store=createFeedReturnStore();store.write({order:'popular',platform:'cross-play',games:games.slice(0,12),active:'g8',next:null});
 for(const platform of ['racing','cross-platform','',null])assert.equal(store.write({order:'popular',platform,games,active:'g1',next:null}),false);
 assert.equal(store.read().platform,'cross-play');assert.equal(store.read().active,'g8');
});
