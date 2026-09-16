import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {canonicalGameUrl,gameNameFromPath,suggestGameName,validGameName} from '../src/lib/game-links.js';
import {gameFormat} from '../src/lib/game-format.js';
const routeSource=readFileSync(new URL('../public/route.js',import.meta.url),'utf8');
function legacyRoute(pathname,search=''){let target=null;runInNewContext(routeSource,{URLSearchParams,location:{pathname,search,hash:'',replace:value=>{target=value;}}});return target;}
test('public names preserve exact existing slugs, prefer claimed names and never shadow reserved routes',()=>{
 assert.equal(canonicalGameUrl({slug:'voxel-drift-ace-9s5l'}),'https://slop.game/voxel-drift-ace-9s5l');assert.equal(canonicalGameUrl({slug:'voxel-drift-ace-9s5l',public_name:'night-drift'}),'https://slop.game/night-drift');assert.equal(canonicalGameUrl({slug:'home'}),'https://slop.game/g/home');
 assert.equal(gameNameFromPath('/night-drift/'),'night-drift');for(const p of ['/home','/mcp/pair','/assets/app.js','/%2Ffake','//evil.test','/../../game'])assert.equal(gameNameFromPath(p),null);
 assert.equal(suggestGameName('My Little Game!'),'my-little-game');for(const n of ['mcp','api','two--hyphens','Uppercase','x','bad/name'])assert.equal(validGameName(n),false);
});
test('released mobile /open links retain their game while bare or ambiguous links keep the download fallback',()=>{
 assert.equal(legacyRoute('/open/','?game=dead-signal-db6f9b4620995c201c3686bcd712cb34&beat=150'),'/#/home?game=dead-signal-db6f9b4620995c201c3686bcd712cb34');
 assert.equal(legacyRoute('/open/'),'/#/download');
 assert.equal(legacyRoute('/open/','?game=first&game=second'),'/#/download');
 assert.equal(legacyRoute('/open/','?game=../private'),'/#/download');
});
test('mobile games stay portrait on desktop; only explicit landscape metadata changes the preview format',()=>{
 assert.equal(gameFormat().aspect,9/16);assert.equal(gameFormat({preview_width:360,preview_height:640}).orientation,'portrait');assert.equal(gameFormat({preview_width:1280,preview_height:720}).aspect,16/9);assert.equal(gameFormat({preview_width:NaN,preview_height:0}).aspect,9/16); assert.deepEqual(gameFormat({preview_width:640,preview_height:640}),{orientation:'square',aspect:1,playerAspect:1});
});
test('reviewed desktop fullscreen uses the game viewport, not its letterboxed recording',()=>{
 const recording={slug:'run-infinite-desktop',preview_width:640,preview_height:360,published_bundle_path:'releases/a4ff1b4e360daffd53058f3d4d726f79fceb4e6f4f2eeea96b4c768365c6b766/run-infinite-desktop'};
 assert.deepEqual(gameFormat(recording),{orientation:'landscape',aspect:16/9,playerAspect:4/3});
 assert.equal(gameFormat({...recording,published_bundle_path:'releases/another-revision/run-infinite-desktop'}).playerAspect,16/9);
 assert.equal(gameFormat({...recording,published_bundle_path:null}).playerAspect,16/9);
});
