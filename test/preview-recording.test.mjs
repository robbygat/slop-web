import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingOwner,assertRecordingOwner,recordingRelease,assertRecordingRelease,measurePreviewMotion,assertPreviewClip} from '../src/lib/preview-recording.js';
import {uploadPreviewVideo} from '../src/lib/video-capture.js';

const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const session={user:{id:owner},epoch:3,access_token:'test-token'};
const game={id,owner_id:owner,slug:'night-drift',name:'Night Drift',status:'published',published_bundle_path:`releases/${'a'.repeat(64)}/night-drift`,bundle_version:'1.0.0',supported_platforms:['mobile']};
const clip=()=>({video:new Uint8Array(8),poster:new Uint8Array(4),width:720,height:1280,durationMs:7000,quality:{frames:210,moving:100,lit:210}});
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
function uploadFixture(changes={}){
 const calls=[];
 return {calls,args:{gameId:id,releaseKey:game.published_bundle_path,clip:clip(),accessToken:'test-token',fetcher:async(url,options)=>{
  calls.push({url:new URL(url),options});const key=new URL(url).searchParams.get('key');
  return response(new URL(url).searchParams.get('kind')==='poster'?{ok:true,kind:'poster',bytes:4,width:720,height:1280}:{ok:true,game_id:id,video_path:`${id}/v1-${key}/preview.mp4`,poster_path:`${id}/v1-${key}/poster.jpg`});
 },...changes}};
}
test('recording belongs to the exact account epoch, including switch away and back',()=>{
 const bound=recordingOwner(session);assert.doesNotThrow(()=>assertRecordingOwner(bound,session));
 for(const value of [null,{...session,epoch:4},{...session,user:{id:'33333333-3333-4333-8333-333333333333'}},{...session,user:{id:owner,is_anonymous:true}}])assert.throws(()=>assertRecordingOwner(bound,value),e=>e.code==='account_changed');
 assert.throws(()=>recordingOwner({...session,user:{id:owner,is_anonymous:true}}));
});
test('only the owner and exact current published release can save recorded footage',()=>{
 const bound=recordingRelease(game,owner);assert.equal(bound.releaseKey,game.published_bundle_path);
 assert.deepEqual(assertRecordingRelease(bound,{...game},owner),bound);
 for(const change of [{owner_id:'other'},{status:'draft'},{bundle_version:'2.0.0'},{published_bundle_path:`releases/${'b'.repeat(64)}/night-drift`},{supported_platforms:['desktop']}])assert.throws(()=>assertRecordingRelease(bound,{...game,...change},owner));
 assert.equal(recordingRelease({...game,published_bundle_path:null},owner).releaseKey,'legacy/night-drift');
});
test('motion uses decoded luma differences and rejects still or blank footage',()=>{
 const frame=Uint8Array.from({length:960},(_,i)=>i%2?200:20),moved=Uint8Array.from(frame,v=>v+2);
 assert.deepEqual(measurePreviewMotion(frame,frame),{lit:true,moving:false});
 assert.deepEqual(measurePreviewMotion(moved,frame),{lit:true,moving:true});
 assert.deepEqual(measurePreviewMotion(new Uint8Array(960),new Uint8Array(960)),{lit:false,moving:false});
 for(const quality of [{frames:210,moving:0,lit:210},{frames:210,moving:30,lit:210},{frames:210,moving:100,lit:100}])assert.throws(()=>assertPreviewClip({...clip(),quality}),/still or blank/);
});
test('clip dimensions, size, duration and actual capture cadence are required',()=>{
 assert.equal(assertPreviewClip(clip()).durationMs,7000);
 for(const change of [{video:new Uint8Array(4194305)},{poster:new Uint8Array(716801)},{width:360},{durationMs:2999},{durationMs:15001}])assert.throws(()=>assertPreviewClip({...clip(),...change}),/valid video preview/);
 assert.throws(()=>assertPreviewClip({...clip(),quality:{frames:40,moving:35,lit:40}}),/too slow/);
 assert.throws(()=>assertPreviewClip({...clip(),quality:undefined}),/too slow/);
});
test('both upload stages carry the recorded release key and require exact saved receipt',async()=>{
 const {calls,args}=uploadFixture();assert.equal(await uploadPreviewVideo(args),true);assert.equal(calls.length,2);
 for(const call of calls)assert.equal(call.url.searchParams.get('release_key'),game.published_bundle_path);
 assert.equal(calls[0].url.searchParams.get('kind'),'poster');assert.equal(calls[1].url.searchParams.get('kind'),'video');
 const invalid=uploadFixture({releaseKey:null});await assert.rejects(()=>uploadPreviewVideo(invalid.args),/release is missing/);assert.equal(invalid.calls.length,0);
});
test('an account switch during poster upload prevents video replacement',async()=>{
 let current=session;const bound=recordingOwner(current),fixture=uploadFixture();const original=fixture.args.fetcher;
 fixture.args.assertCurrent=()=>assertRecordingOwner(bound,current);
 fixture.args.fetcher=async(...args)=>{const result=await original(...args);current={...session,epoch:9};return result;};
 await assert.rejects(()=>uploadPreviewVideo(fixture.args),e=>e.code==='account_changed');assert.equal(fixture.calls.length,1);
});
test('failed or mismatched video receipt never reports a saved preview',async()=>{
 for(const value of [{ok:false,code:'revision_superseded'},{ok:true,game_id:'wrong',video_path:'wrong',poster_path:'wrong'}]){
  const fixture=uploadFixture(),original=fixture.args.fetcher;
  fixture.args.fetcher=async(url,options)=>new URL(url).searchParams.get('kind')==='video'?response(value):original(url,options);
  await assert.rejects(()=>uploadPreviewVideo(fixture.args));
 }
});
