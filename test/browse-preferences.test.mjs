import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSE_PREFERENCES_KEY,createBrowsePreferencesStore,normalizeBrowsePreferences} from '../src/lib/browse-preferences.js';
import {createFeedReturnStore} from '../src/lib/feed-return.js';

function localStorage(initial){
 const items=new Map(initial==null?[]:[[BROWSE_PREFERENCES_KEY,initial]]);
 return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)};
}

test('platform and sorting choices survive route changes and a fresh browser visit',()=>{
 const storage=localStorage(),home=createBrowsePreferencesStore({storage});
 assert.deepEqual(home.read(),{platform:'all',order:'newest'});
 home.write({platform:'desktop'});home.write({order:'popular'});
 const feed=createBrowsePreferencesStore({storage});
 assert.deepEqual(feed.read(),{platform:'desktop',order:'popular'});
 feed.write({platform:'mobile'});
 assert.deepEqual(home.read(),{platform:'mobile',order:'popular'});
 assert.deepEqual(createBrowsePreferencesStore({storage}).read(),{platform:'mobile',order:'popular'});
});

test('legacy cross-play choices normalize to Mobile while preserving sorting',()=>{
 for(const platform of ['cross-play','cross-platform']){
  const storage=localStorage(JSON.stringify({platform,order:'popular'})),store=createBrowsePreferencesStore({storage});
  assert.deepEqual(store.read(),{platform:'mobile',order:'popular'});
  store.write({order:'newest'});
  assert.deepEqual(JSON.parse(storage.getItem(BROWSE_PREFERENCES_KEY)),{platform:'mobile',order:'newest'});
 }
});

test('malformed or unsupported saved choices cannot become discovery filters',()=>{
 for(const raw of ['{broken','null','42','[]','{"platform":"other","order":"random"}']){
  assert.deepEqual(createBrowsePreferencesStore({storage:localStorage(raw)}).read(),{platform:'all',order:'newest'});
 }
 assert.deepEqual(normalizeBrowsePreferences({platform:'desktop',order:'random'}),{platform:'desktop',order:'newest'});
 const store=createBrowsePreferencesStore({storage:localStorage()});
 store.write({platform:'desktop',order:'popular'});
 assert.deepEqual(store.write({platform:'unknown',order:null}),{platform:'desktop',order:'popular'});
});

test('the preference record stores only public platform and sort choices',()=>{
 const storage=localStorage(),store=createBrowsePreferencesStore({storage});
 const result=store.write({platform:'mobile',order:'popular',games:[{id:'private'}],userId:'account',search:'query',score:900});
 assert.deepEqual(JSON.parse(storage.getItem(BROWSE_PREFERENCES_KEY)),{platform:'mobile',order:'popular'});
 result.platform='desktop';
 assert.equal(store.read().platform,'mobile');
});

test('unavailable storage preserves choices in memory without breaking navigation',()=>{
 for(const storage of [null,()=>{throw new Error('blocked');},{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}]){
  const store=createBrowsePreferencesStore({storage});
  store.write({platform:'desktop'});store.write({order:'popular'});
  assert.deepEqual(store.read(),{platform:'desktop',order:'popular'});
 }
});

test('a failed storage write cannot roll back the latest in-tab choice on the next read',()=>{
 const raw=JSON.stringify({platform:'all',order:'newest'});
 const store=createBrowsePreferencesStore({storage:{getItem:()=>raw,setItem(){throw new Error('quota');}}});
 store.write({platform:'mobile'});store.write({order:'popular'});
 assert.deepEqual(store.read(),{platform:'mobile',order:'popular'});
});

test('a newer Home preference wins over an older Play snapshot; matching game returns still restore',()=>{
 const preferences=createBrowsePreferencesStore({storage:localStorage()}),feed=createFeedReturnStore();
 const games=[{id:'first'},{id:'active'}];
 preferences.write({platform:'mobile',order:'popular'});
 feed.write({...preferences.read(),games,active:'active',next:null});
 assert.equal(feed.read(preferences.read()).active,'active');
 preferences.write({platform:'desktop'});
 assert.equal(feed.read(preferences.read()),null);
 preferences.write({platform:'mobile',order:'newest'});
 assert.equal(feed.read(preferences.read()),null);
 preferences.write({order:'popular'});
 assert.equal(feed.read(preferences.read()).active,'active');
});

test('browsing preferences outlive the short-lived game return snapshot',()=>{
 let now=0;const preferences=createBrowsePreferencesStore({storage:localStorage()}),feed=createFeedReturnStore({now:()=>now});
 preferences.write({platform:'desktop',order:'popular'});
 feed.write({...preferences.read(),games:[{id:'game'}],active:'game',next:null});
 now=300001;
 assert.equal(feed.read(preferences.read()),null);
 assert.deepEqual(preferences.read(),{platform:'desktop',order:'popular'});
});
