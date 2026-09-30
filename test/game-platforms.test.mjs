import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePlatform,platformValues,filterPlatform} from '../src/lib/game-platforms.js';
import {gameFormat} from '../src/lib/game-format.js';
import {createClient} from '@supabase/supabase-js';
import {desktopDiscoveryClause} from '../src/lib/reviewed-desktop-games.js';
import {discoveryBoundary} from '../src/lib/catalog-cursor.js';

const client=createClient('https://catalog-test.invalid','catalog-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

test('authoritative device support stays separate from the preview shape',()=>{
 assert.equal(gamePlatform({preview_width:1280,preview_height:720}),'mobile');
 assert.equal(gamePlatform({supported_platforms:['desktop'],preview_width:360,preview_height:640}),'desktop');
 assert.equal(gamePlatform({supported_platforms:['mobile','desktop']}),'cross-play');
 assert.deepEqual(platformValues('cross-play'),['mobile','desktop']);
 assert.deepEqual(platformValues('cross-platform'),['mobile','desktop']);
 assert.throws(()=>platformValues('racing'));
 assert.equal(gameFormat().aspect,9/16);assert.equal(gameFormat().playerAspect,9/19.5);
 assert.equal(gameFormat({preview_width:1280,preview_height:720}).playerAspect,16/9);
 assert.equal(gameFormat({supported_platforms:['desktop']}).playerAspect,16/9);
});

const catalog=[
 {slug:'touch-only',supported_platforms:['mobile']},
 {slug:'keyboard-only',supported_platforms:['desktop']},
 {slug:'both-devices',supported_platforms:['mobile','desktop']},
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

test('Mobile includes touch-only and cross-play games',()=>{
 const query=filterPlatform(catalogQuery(),'mobile');
 assert.deepEqual(query.rows.map(row=>row.slug),['touch-only','both-devices']);
 assert.deepEqual(query.calls,[['contains','supported_platforms',['mobile']]]);
});

test('Desktop requests declared desktop support or an exact reviewed public release',()=>{
 const query=filterPlatform(client.from('games').select('slug'),'desktop');
 assert.deepEqual(query.url.searchParams.getAll('or'),[`(${desktopDiscoveryClause()})`]);
 assert.ok(query.url.searchParams.get('or').startsWith('(supported_platforms.cs.{desktop},'));
 assert.equal(query.url.searchParams.has('supported_platforms'),false);
});

test('Cross-play accepts both device declarations or an exact reviewed public release',()=>{
 for(const value of ['cross-play','cross-platform']){
  const query=filterPlatform(client.from('games').select('slug'),value);
  assert.deepEqual(query.url.searchParams.getAll('or'),[`(${desktopDiscoveryClause(true)})`]);
  assert.ok(query.url.searchParams.get('or').startsWith('(and(supported_platforms.cs.{mobile},supported_platforms.cs.{desktop}),'));
 }
});

test('platform alternatives and stable discovery cursors remain separate AND conditions',()=>{
 const cursor={slug:'older-game',created_at:'2026-09-30T00:00:00.123456Z',plays:8};
 for(const platform of ['desktop','cross-play'])for(const order of ['newest','popular']){
  const query=filterPlatform(client.from('games').select('slug').eq('status','published').eq('media_delete_authorized',false),platform).or(discoveryBoundary(cursor,order));
  assert.deepEqual(query.url.searchParams.getAll('or'),[`(${desktopDiscoveryClause(platform==='cross-play')})`,`(${discoveryBoundary(cursor,order)})`]);
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
