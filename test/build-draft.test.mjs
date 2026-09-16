import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_IDEA_KEY,MAX_GAME_IDEA,buildIdeaRoute,clearBuildIdea,parseBuildIdea,pendingBuildRoute,readBuildIdea,saveBuildIdea} from '../src/lib/build-draft.js';
const id='d68d7b70-89c3-4713-9eef-f625758e5c7b',other='f8cb930c-43db-45a1-a4b3-c55aab723d28';
const now=Date.now();
function memory(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
test('a guest idea survives sign-in and becomes private to its selected owner',()=>{
 const storage=memory();saveBuildIdea('A little racing game',{id,storage,now,awaitingAuth:true});
 const guest=readBuildIdea({ownerId:'owner-a',storage,now});assert.equal(guest.prompt,'A little racing game');
 assert.equal(pendingBuildRoute(storage.getItem(BUILD_IDEA_KEY),'owner-a',now),'/build?idea='+id);
 saveBuildIdea(guest.prompt,{id,ownerId:'owner-a',storage,now});
 assert.equal(readBuildIdea({ownerId:'owner-a',storage,now}).prompt,guest.prompt);
 assert.equal(readBuildIdea({ownerId:'owner-b',storage,now}),null);
 assert.equal(readBuildIdea({storage,now}),null);
 assert.equal(pendingBuildRoute(storage.getItem(BUILD_IDEA_KEY),'owner-a',now),null);
});
test('routing carries only the opaque idea ID and a validated remix ID',()=>{
 const storage=memory(),idea=saveBuildIdea('secret prompt + & ?',{id,remixId:other,storage,now});
 assert.equal(buildIdeaRoute(idea),`/build?idea=${id}&remix=${other}`);
 assert.equal(readBuildIdea({id:other,storage,now}),null);
 assert.equal(parseBuildIdea(JSON.stringify({...idea,remixId:'https://evil.test'}),{now}).remixId,null);
});
test('empty or stale drafts never trigger an OAuth return',()=>{
 const storage=memory();saveBuildIdea('   ',{id,storage,now,awaitingAuth:true});
 assert.equal(pendingBuildRoute(storage.getItem(BUILD_IDEA_KEY),'a',now),null);
 saveBuildIdea('A game',{id,storage,now,awaitingAuth:true});
 assert.equal(readBuildIdea({storage,now:now+86400001}),null);
 assert.equal(readBuildIdea({storage,now:now-60001}),null);
});
test('malformed, over-limit and unavailable storage fail safely',()=>{
 const storage=memory();storage.setItem(BUILD_IDEA_KEY,'{bad');assert.equal(readBuildIdea({storage,now}),null);
 assert.equal(saveBuildIdea('x'.repeat(MAX_GAME_IDEA+1),{id,storage,now}),null);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(saveBuildIdea('A game',{id,storage:blocked,now}),null);assert.equal(readBuildIdea({storage:blocked}),null);
 assert.equal(parseBuildIdea(JSON.stringify({version:1,id,prompt:'x',updatedAt:now}),{now}),null);
});
test('accepting a run clears only that owner and exact draft revision',()=>{
 const storage=memory();saveBuildIdea('A game',{id,ownerId:'a',storage,now});
 clearBuildIdea({ownerId:'b',id,storage});assert.ok(readBuildIdea({ownerId:'a',storage,now}));
 clearBuildIdea({ownerId:'a',id:other,storage});assert.ok(readBuildIdea({ownerId:'a',storage,now}));
 clearBuildIdea({ownerId:'a',id,storage});assert.equal(readBuildIdea({ownerId:'a',storage,now}),null);
});
