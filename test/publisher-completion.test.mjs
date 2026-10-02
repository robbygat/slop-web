import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attachPublishedVideo,completePublisherJob,publisherMaxJobs} from '../scripts/mcp-publisher/completion.mjs';

test('publication does not complete before video attachment and a missing video never republishes',async()=>{
 let attach,finishCalls=0,failCalls=0,settled=false;
 const pending=completePublisherJob({finish:async()=>{finishCalls++;return {status:200,body:{ok:true,status:'published',slug:'mcp-game'}};},attachVideo:()=>new Promise(r=>{attach=r;}),fail:async()=>{failCalls++;}}).then(value=>{settled=true;return value;});
 await new Promise(r=>setImmediate(r));assert.equal(settled,false);attach(false);
 assert.deepEqual(await pending,{status:'video_missing',code:'video_attachment_failed'});assert.equal(finishCalls,1);assert.equal(failCalls,0);
});
test('successful attachment produces the only published completion',async()=>{
 const r=await completePublisherJob({finish:async()=>({status:200,body:{ok:true,status:'published',slug:'mcp-game',update:true}}),attachVideo:async slug=>slug==='mcp-game',fail:async()=>assert.fail('must not fail published job')});
 assert.deepEqual(r,{status:'published',update:true});
});
test('explicit non-retryable publication failure stays permanent without immediately republishing',async()=>{
 const failed=[];let finished=0;
 const r=await completePublisherJob({finish:async()=>{finished++;return {status:409,body:{ok:false,code:'publish_failed',retryable:false}};},attachVideo:async()=>assert.fail('cannot attach an unpublished game'),fail:async x=>failed.push(x)});
 assert.equal(r.status,'failed');assert.equal(finished,1);assert.deepEqual(failed,[{failure_code:'publish_failed',retryable:false}]);
});
test('permanent failure remains permanent and pending review has no premature public video',async()=>{
 let input;
 await completePublisherJob({finish:async()=>({status:409,body:{ok:false,code:'revision_superseded',retryable:false}}),attachVideo:async()=>assert.fail(),fail:async x=>{input=x;}});assert.equal(input.retryable,false);
 assert.deepEqual(await completePublisherJob({finish:async()=>({status:200,body:{ok:true,status:'pending_review'}}),attachVideo:async()=>assert.fail(),fail:async()=>assert.fail()}),{status:'pending_review',update:false});
});
test('one-job workflow excludes the global video pass and job counts are bounded',async()=>{
 assert.equal(publisherMaxJobs('1'),1);assert.equal(publisherMaxJobs(),8);
 for(const n of [0,9,-1,1.5,'NaN','Infinity'])assert.throws(()=>publisherMaxJobs(n));
 const workflow=await readFile(new URL('../.github/workflows/mcp-autopublish.yml',import.meta.url),'utf8');
 assert.match(workflow,/options: \[incremental, backfill, publish_one, repair_one\]/);
 assert.match(workflow,/SLOP_PUBLISHER_MAX_JOBS: \$\{\{ inputs.videos == 'publish_one' && 1 \|\| 8 \}\}/);
 const videos=workflow.slice(workflow.indexOf('\n  videos:'));
 assert.match(videos,/if: github.ref == 'refs\/heads\/main' && inputs.videos != 'publish_one'/);
});
test('one-release repair is manual main-only and excludes publication and catalog passes',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/mcp-autopublish.yml',import.meta.url),'utf8');
 const publish=workflow.slice(workflow.indexOf('\n  publish:'),workflow.indexOf('\n  videos:'));
 const videos=workflow.slice(workflow.indexOf('\n  videos:'),workflow.indexOf('\n  repair-video:'));
 const repair=workflow.slice(workflow.indexOf('\n  repair-video:'));
 assert.match(publish,/inputs.videos != 'repair_one'/);
 assert.match(videos,/inputs.videos != 'repair_one'/);
 assert.match(repair,/if: github.ref == 'refs\/heads\/main' && github.event_name == 'workflow_dispatch' && inputs.videos == 'repair_one'/);
 assert.match(repair,/timeout-minutes: 15/);
 for(const key of ['SLUG','SOURCE_DIGEST','RELEASE_ROOT'])assert.match(repair,new RegExp(`SLOP_REPAIR_${key}:`));
 assert.match(repair,/run: node scripts\/mcp-publisher\/repair-video.mjs/);
 assert.doesNotMatch(repair,/run:.*\$\{\{/,'inputs are env values, never shell fragments');
});

const digest = async manifest => (await import('../src/lib/bundle-contracts.js')).sha256(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n'));
async function releaseFixture() {
 const manifest=['game.js','index.html','slop.js'].map(path=>({path:`1.0.0/${path}`,bytes:10,sha256:'a'.repeat(64)}));
 const sourceDigest=await digest(manifest);
 return {sourceDigest,row:{id:'11111111-1111-4111-8111-111111111111',owner_id:'22222222-2222-4222-8222-222222222222',slug:'mcp-game',status:'published',published_bundle_path:`releases/${'b'.repeat(64)}/mcp-game`,bundle_manifest:manifest,bundle_digest:sourceDigest}};
}
test('video retry pins the source-verified release and never attaches to a changed release',async()=>{
 const {row,sourceDigest}=await releaseFixture();let reads=0;const uploads=[];
 const ok=await attachPublishedVideo({slug:row.slug,sourceDigest,readGame:async()=>({...row,published_bundle_path:reads++===0?row.published_bundle_path:`releases/${'c'.repeat(64)}/mcp-game`}),upload:async receipt=>{uploads.push(receipt);return false;},delay:async()=>{}});
 assert.equal(ok,false);assert.equal(uploads.length,1);assert.equal(uploads[0].release_root,row.published_bundle_path);
});
test('different recorded source or invalid manifest refuses every upload',async()=>{
 const {row,sourceDigest}=await releaseFixture();
 for(const input of [{...row,bundle_digest:'c'.repeat(64)},row]) {
  assert.equal(await attachPublishedVideo({slug:row.slug,sourceDigest:input===row?'d'.repeat(64):sourceDigest,readGame:async()=>input,upload:async()=>assert.fail('stale source must not upload'),delay:async()=>{}}),false);
 }
});
test('same release retries safely and explicit retryable server failure remains retryable',async()=>{
 const {row,sourceDigest}=await releaseFixture();const uploads=[];
 assert.equal(await attachPublishedVideo({slug:row.slug,sourceDigest,readGame:async()=>row,upload:async receipt=>{uploads.push(receipt.release_root);return uploads.length===2;},delay:async()=>{}}),true);
 assert.deepEqual(uploads,[row.published_bundle_path,row.published_bundle_path]);
 let failed;
 await completePublisherJob({finish:async()=>({status:503,body:{ok:false,code:'publish_failed',retryable:true}}),attachVideo:async()=>assert.fail(),fail:async x=>{failed=x;}});
 assert.equal(failed.retryable,true);
});

test('API slowdown stops attachment immediately without retrying production',async()=>{
 const {ApiHealthFailure}=await import('../scripts/mcp-publisher/safety.mjs');
 const {row,sourceDigest}=await releaseFixture();let reads=0;
 await assert.rejects(attachPublishedVideo({slug:row.slug,sourceDigest,readGame:async()=>{reads++;throw new ApiHealthFailure();},upload:async()=>assert.fail(),delay:async()=>assert.fail('no delay/retry on slowdown')}),ApiHealthFailure);
 assert.equal(reads,1);
});
