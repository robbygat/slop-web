import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_PLATFORMS,gamePlatform,webGamePlatform,platformValues,platformValueForTarget,filterPlatform} from '../src/lib/game-platforms.js';
import {gameFormat} from '../src/lib/game-format.js';
import {createClient} from '@supabase/supabase-js';
import {REVIEWED_DESKTOP_RELEASES} from '../src/lib/reviewed-desktop-games.js';
import {discoveryBoundary} from '../src/lib/catalog-cursor.js';

const client=createClient('https://catalog-test.invalid','catalog-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

test('catalog groups games that support phones as mobile without changing creator targets',()=>{
 assert.deepEqual(GAME_PLATFORMS,[['all','All games'],['mobile','Mobile'],['desktop','Desktop']]);
 assert.equal(gamePlatform({preview_width:1280,preview_height:720}),'mobile');
 assert.equal(gamePlatform({supported_platforms:['desktop'],preview_width:360,preview_height:640}),'desktop');
 for(const supported_platforms of [['mobile','desktop'],['desktop','mobile']]){
  const game=Object.freeze({supported_platforms:Object.freeze(supported_platforms)});
  assert.equal(gamePlatform(game),'mobile');assert.equal(webGamePlatform(game),'mobile');
  assert.deepEqual(game.supported_platforms,supported_platforms);
 }
 assert.deepEqual(platformValues('cross-play'),['mobile','desktop']);
 assert.deepEqual(platformValues('cross-platform'),['mobile','desktop']);
 assert.equal(platformValueForTarget('cross-platform'),'cross-play');
 assert.throws(()=>platformValues('racing'));
 assert.equal(gameFormat().aspect,9/16);assert.equal(gameFormat().playerAspect,9/19.5);
 assert.equal(gameFormat({preview_width:1280,preview_height:720}).playerAspect,16/9);
 assert.equal(gameFormat({supported_platforms:['desktop']}).playerAspect,16/9);
});

const catalog=[
 {slug:'touch-only',supported_platforms:['mobile']},
 {slug:'keyboard-only',supported_platforms:['desktop']},
 {slug:'both-devices',supported_platforms:['mobile','desktop']},
 ...REVIEWED_DESKTOP_RELEASES.map((review,index)=>({slug:`reviewed-phone-${index}`,status:'published',supported_platforms:['mobile'],published_bundle_path:review.root,bundle_version:review.version})),
];
function catalogQuery(){
 const query={rows:[...catalog],calls:[],
  contains(field,values){this.calls.push(['contains',field,values]);this.rows=this.rows.filter(row=>values.every(value=>row[field].includes(value)));return this;},
  containedBy(field,values){this.calls.push(['containedBy',field,values]);this.rows=this.rows.filter(row=>row[field].every(value=>values.includes(value)));return this;},
 };
 return query;
}

test('All games leaves the catalog query and every supported game intact',()=>{
 for(const value of ['all',undefined]){
  const query=catalogQuery();assert.equal(filterPlatform(query,value),query);
  assert.deepEqual(query.rows,catalog);assert.deepEqual(query.calls,[]);
 }
});

test('Mobile includes phone games, both-device games and reviewed phone releases',()=>{
 const query=filterPlatform(catalogQuery(),'mobile');
 assert.deepEqual(query.rows.map(row=>row.slug),['touch-only','both-devices','reviewed-phone-0','reviewed-phone-1']);
 assert.deepEqual(query.calls,[['contains','supported_platforms',['mobile']]]);
});

test('Desktop excludes both-device and reviewed mobile games',()=>{
 const rows=filterPlatform(catalogQuery(),'desktop');
 assert.deepEqual(rows.rows.map(row=>row.slug),['keyboard-only']);
 assert.deepEqual(rows.calls,[['contains','supported_platforms',['desktop']],['containedBy','supported_platforms',['desktop']]]);
 const query=filterPlatform(client.from('games').select('slug'),'desktop');
 assert.deepEqual(query.url.searchParams.getAll('supported_platforms'),['cs.{desktop}','cd.{desktop}']);
 assert.equal(query.url.searchParams.has('or'),false);
});

test('legacy cross-play filters resolve to the Mobile catalog',()=>{
 for(const value of ['cross-play','cross-platform']){
  const rows=filterPlatform(catalogQuery(),value);
  assert.deepEqual(rows.rows,filterPlatform(catalogQuery(),'mobile').rows);
  assert.deepEqual(rows.calls,[['contains','supported_platforms',['mobile']]]);
  const query=filterPlatform(client.from('games').select('slug'),value);
  assert.deepEqual(query.url.searchParams.getAll('supported_platforms'),['cs.{mobile}']);
  assert.equal(query.url.searchParams.has('or'),false);
 }
});

test('platform filters and stable discovery cursors remain separate AND conditions',()=>{
 const cursor={slug:'older-game',created_at:'2026-09-30T00:00:00.123456Z',plays:8};
 for(const platform of ['mobile','desktop','cross-play','cross-platform'])for(const order of ['newest','popular']){
  const query=filterPlatform(client.from('games').select('slug').eq('status','published').eq('media_delete_authorized',false),platform).or(discoveryBoundary(cursor,order));
  assert.deepEqual(query.url.searchParams.getAll('or'),[`(${discoveryBoundary(cursor,order)})`]);
  assert.deepEqual(query.url.searchParams.getAll('supported_platforms'),platform==='desktop'?['cs.{desktop}','cd.{desktop}']:['cs.{mobile}']);
  assert.equal(query.url.searchParams.get('status'),'eq.published');
  assert.equal(query.url.searchParams.get('media_delete_authorized'),'eq.false');
 }
});

test('invalid device filters fail before mutating the catalog query',()=>{
 for(const value of ['racing','android','',null,42]){
  const query=catalogQuery();assert.throws(()=>filterPlatform(query,value),/Choose phone, desktop, or both/);
  assert.deepEqual(query.rows,catalog);assert.deepEqual(query.calls,[]);
 }
});
