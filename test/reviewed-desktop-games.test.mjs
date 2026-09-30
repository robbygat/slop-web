import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEWED_DESKTOP_RELEASES,reviewedDesktopGame,reviewedDesktopClauses} from '../src/lib/reviewed-desktop-games.js';
import {gamePlatform,webGamePlatform} from '../src/lib/game-platforms.js';

const published=review=>({name:review.name,status:'published',supported_platforms:['mobile'],published_bundle_path:review.root,bundle_version:review.version});

test('reviewed desktop support applies only to the two exact published release versions',()=>{
 assert.equal(REVIEWED_DESKTOP_RELEASES.length,2);
 for(const review of REVIEWED_DESKTOP_RELEASES){
  const game=published(review);assert.equal(reviewedDesktopGame(game),review);assert.ok(review.hint.length>0);
  assert.equal(gamePlatform(game),'mobile');assert.equal(webGamePlatform(game),'cross-play');
 }
});
test('new releases and versions cannot inherit a prior compatibility review',()=>{
 for(const review of REVIEWED_DESKTOP_RELEASES){
  const game=published(review);
  for(const change of [{published_bundle_path:review.root.replace(/releases\/[a-f0-9]{64}/,'releases/'+ 'a'.repeat(64))},{published_bundle_path:null},{bundle_version:'1.0.1'},{bundle_version:null}]){
   assert.equal(reviewedDesktopGame({...game,...change}),null);assert.equal(webGamePlatform({...game,...change}),'mobile');
  }
 }
});
test('draft, private, missing-status and missing-mobile records are never promoted',()=>{
 for(const review of REVIEWED_DESKTOP_RELEASES){
  const game=published(review);
  for(const change of [{status:'draft'},{status:'private'},{status:null},{supported_platforms:[]},{supported_platforms:null},{supported_platforms:['desktop']}])assert.equal(reviewedDesktopGame({...game,...change}),null);
 }
 assert.equal(reviewedDesktopGame(null),null);assert.equal(reviewedDesktopGame({}),null);
});
test('titles, slugs, portrait recordings and aspect ratios are not desktop evidence',()=>{
 for(const review of REVIEWED_DESKTOP_RELEASES){
  assert.equal(reviewedDesktopGame({name:review.name,slug:review.root.split('/').at(-1),status:'published',supported_platforms:['mobile'],bundle_version:review.version,preview_width:1280,preview_height:720}),null);
  assert.equal(reviewedDesktopGame({...published(review),name:'Changed title',slug:'changed-title'}),review);
 }
 assert.equal(webGamePlatform({status:'published',supported_platforms:['mobile','desktop']}),'cross-play');
 assert.equal(webGamePlatform({status:'published',supported_platforms:['desktop']}),'desktop');
});
test('server review clauses enforce the same publication, device and exact release criteria',()=>{
 const clauses=reviewedDesktopClauses();assert.equal(clauses.length,REVIEWED_DESKTOP_RELEASES.length);
 for(const [i,review] of REVIEWED_DESKTOP_RELEASES.entries()){
  assert.equal(clauses[i],`and(status.eq.published,supported_platforms.cs.{mobile},published_bundle_path.eq.${review.root},bundle_version.eq.${review.version})`);
  assert.match(review.root,/^releases\/[a-f0-9]{64}\/mcp-[a-f0-9]{32}$/);assert.match(review.version,/^\d+\.\d+\.\d+$/);assert.match(review.sourceSHA256,/^[a-f0-9]{64}$/);
 }
});
