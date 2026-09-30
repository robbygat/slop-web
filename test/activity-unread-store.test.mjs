import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityUnreadStore} from '../src/lib/activity-unread-store.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('header and social share one unread read and notification subscription lifecycle',async()=>{
  let loads=0,starts=0,stops=0,change;
  const store=createActivityUnreadStore({load:async()=>{loads++;return 3;},start:refresh=>{starts++;change=refresh;return()=>stops++;}});
  const first=store.subscribe(()=>{}),second=store.subscribe(()=>{});await tick();
  assert.equal(loads,1);assert.equal(starts,1);assert.equal(store.getSnapshot().unread,3);
  await change();assert.equal(loads,2);
  first();assert.equal(stops,0);second();assert.equal(stops,1);assert.equal(store.getSnapshot().unread,0);
});

test('a released account cannot apply its delayed unread count after switching away and back',async()=>{
  const old=deferred(),fresh=deferred();let loads=0;
  const store=createActivityUnreadStore({load:()=>++loads===1?old.promise:fresh.promise});
  const release=store.subscribe(()=>{});release();const releaseAgain=store.subscribe(()=>{});
  old.resolve(99);await tick();assert.equal(store.getSnapshot().unread,0);assert.equal(store.getSnapshot().loading,true);
  fresh.resolve(2);await tick();assert.equal(store.getSnapshot().unread,2);releaseAgain();
});

test('a new event during an unread request triggers a fresh count instead of losing the notification',async()=>{
  const first=deferred(),second=deferred();let loads=0;
  const store=createActivityUnreadStore({load:()=>++loads===1?first.promise:second.promise});
  const release=store.subscribe(()=>{});void store.refresh();first.resolve(0);await tick();
  assert.equal(loads,2);second.resolve(1);await tick();assert.equal(store.getSnapshot().unread,1);release();
});

test('a received read receipt supersedes an older unread request and failures never fabricate counts',async()=>{
  const pending=deferred();const store=createActivityUnreadStore({load:()=>pending.promise});
  const release=store.subscribe(()=>{});store.publish(0);pending.resolve(7);await tick();assert.equal(store.getSnapshot().unread,0);
  store.publish(-1);store.publish('4');assert.equal(store.getSnapshot().unread,0);release();
  const failed=createActivityUnreadStore({load:async()=>{throw new Error('offline');}}),stop=failed.subscribe(()=>{});
  await tick();assert.equal(failed.getSnapshot().unread,0);assert.equal(failed.getSnapshot().error.message,'offline');stop();
});

test('an older inbox snapshot cannot overwrite a newer count from a realtime refresh',async()=>{
  const first=deferred(),second=deferred();let loads=0;
  const store=createActivityUnreadStore({load:()=>++loads===1?first.promise:second.promise});
  const stop=store.subscribe(()=>{}),inboxRead=store.beginRead();void store.refresh();
  first.resolve(7);await tick();second.resolve(1);await tick();
  store.publishAt(0,inboxRead);assert.equal(store.getSnapshot().unread,1);stop();
});
