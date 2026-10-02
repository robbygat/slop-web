import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gameTemplate} from '../mcp/game-template.mjs';
import {recorderManifest,recorderFileBytes} from '../scripts/mcp-publisher/world-recorder.mjs';
import {repairSelection,loadRepairBundle,repairOneVideo,boundedResponseBytes,uploadRepairVideo} from '../scripts/mcp-publisher/repair-video.mjs';
import {ApiHealthFailure} from '../scripts/mcp-publisher/safety.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=manifest=>hash([...manifest].sort((a,b)=>a.path.localeCompare(b.path)).map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'));
const clone=value=>JSON.parse(JSON.stringify(value));
const template=await gameTemplate({persistent:true,target_platform:'mobile'});
function fixture(){
 const files={...template.files,'zone.bin':{encoding:'base64',data:Buffer.from([0,255,12,98]).toString('base64')}};
 const manifest=recorderManifest(files),slug=`mcp-${'a'.repeat(32)}`;
 const selection={slug,sourceDigest:digest(manifest),releaseRoot:`releases/${'b'.repeat(64)}/${slug}`};
 const media={path:'1.0.0/covers/cover.jpg',bytes:10,sha256:'c'.repeat(64)};
 const row={id:'11111111-1111-4111-8111-111111111111',owner_id:'22222222-2222-4222-8222-222222222222',slug,status:'published',media_delete_authorized:false,persistent:true,bundle_version:'1.0.0',published_bundle_path:selection.releaseRoot,bundle_manifest:[...manifest,media],bundle_digest:digest([...manifest,media]),preview_video:null};
 const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});const prefix=`https://api.slop.game/storage/v1/object/public/games/${selection.releaseRoot}/1.0.0/`;assert.ok(url.startsWith(prefix));return new Response(recorderFileBytes(url.slice(prefix.length),files[url.slice(prefix.length)]));};
 return {files,manifest,selection,row,calls,fetchImpl};
}
const videoRow=(row,releaseRoot,key='d'.repeat(32))=>({game_id:row.id,release_key:releaseRoot,video_path:`${row.id}/v1-${key}/preview.mp4`,poster_path:`${row.id}/v1-${key}/poster.jpg`,width:720,height:1280,duration_ms:7000});
const clip={video:Buffer.from('test-only-recorded-video'),poster:Buffer.from('test-only-poster'),width:720,height:1280,durationMs:7000};
const unused=async()=>assert.fail('operation must not run');

test('repair requires a single explicit MCP slug, full source digest and matching immutable root',()=>{
 const {selection}=fixture();assert.deepEqual(repairSelection(selection),selection);
 for(const bad of [{},{...selection,slug:'all'},{...selection,sourceDigest:'x'},{...selection,releaseRoot:selection.releaseRoot+'/../'},{...selection,releaseRoot:selection.releaseRoot.replace(selection.slug,'other')}])assert.throws(()=>repairSelection(bad),{code:'repair_selection_invalid'});
});
test('reconstructs only verified own-release source with binary descriptors and real persistent runtime',async()=>{
 const f=fixture(),result=await loadRepairBundle(f.row,f.selection,{fetchImpl:f.fetchImpl});
 assert.deepEqual(result.files,f.files);assert.equal(result.target,'mobile');assert.equal(result.count,Object.keys(f.files).length);
 assert.equal(f.calls.length,result.count);assert.ok(f.calls.every(c=>!c.url.includes('/covers/')&&c.options.credentials==='omit'&&c.options.redirect==='error'&&c.options.signal instanceof AbortSignal));
});
test('status, identity, release and source changes refuse every asset download',async()=>{
 const f=fixture();
 for(const patch of [{status:'draft'},{media_delete_authorized:true},{media_delete_authorized:undefined},{id:'not-a-uuid'},{owner_id:'not-a-uuid'},{slug:'mcp-other'},{persistent:false},{bundle_version:'2.0.0'},{published_bundle_path:f.selection.releaseRoot.replace('bbb','ccc')},{bundle_digest:'e'.repeat(64)}])
  await assert.rejects(loadRepairBundle({...f.row,...patch},f.selection,{fetchImpl:unused}));
});
test('malformed paths, duplicate paths, budgets and hidden non-source directories fail closed',async()=>{
 const f=fixture();
 for(const extra of [{path:'1.0.0/../escape.bin',bytes:4,sha256:'a'.repeat(64)},{path:'1.0.0/zone.bin',bytes:4,sha256:'a'.repeat(64)},{path:'1.0.0/other.exe',bytes:4,sha256:'a'.repeat(64)},{path:'1.0.0/huge.bin',bytes:8000001,sha256:'a'.repeat(64)}]){
  const manifest=[...f.row.bundle_manifest,extra],source=manifest.filter(v=>!v.path.includes('/covers/'));
  await assert.rejects(loadRepairBundle({...f.row,bundle_manifest:manifest,bundle_digest:digest(manifest)},{...f.selection,sourceDigest:digest(source)},{fetchImpl:unused}));
 }
});
for(const kind of ['corrupt','truncated','oversized'])test(`${kind} public source bytes reject before recording or upload`,async()=>{
 const f=fixture();let recorded=0,uploaded=0;
 await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:async(url,options)=>{
  const response=await f.fetchImpl(url,options),bytes=Buffer.from(await response.arrayBuffer());
  return new Response(kind==='corrupt'?Buffer.alloc(bytes.length,1):kind==='truncated'?bytes.subarray(1):Buffer.concat([bytes,Buffer.from([1])]));
 },record:async()=>{recorded++;},upload:async()=>{uploaded++;}}));
 assert.equal(recorded,0);assert.equal(uploaded,0);
});
test('bounded reader rejects oversized length and streamed bodies',async()=>{
 await assert.rejects(boundedResponseBytes(new Response('small',{headers:{'content-length':'999999'}}),10),{code:'repair_asset_size'});
 await assert.rejects(boundedResponseBytes(new Response('more than ten bytes'),10),{code:'repair_asset_size'});
});
test('already-current video is a read-only no-op; old-release video does not satisfy repair',async()=>{
 const f=fixture();f.row.preview_video=[videoRow(f.row,f.selection.releaseRoot)];
 assert.deepEqual(await repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:unused,record:unused,upload:unused}),{status:'already_ready'});
 let recorded=0,uploaded=0;f.row.preview_video=[videoRow(f.row,'legacy/old')];
 const result=await repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>{recorded++;return clip;},upload:async({receipt,key,checkCurrent})=>{
  uploaded++;await checkCurrent();assert.equal(receipt.release_root,f.selection.releaseRoot);f.row.preview_video=[videoRow(f.row,f.selection.releaseRoot,key)];return true;
 }});
 assert.equal(result.status,'attached');assert.equal(recorded,1);assert.equal(uploaded,1);
});
test('release changes during capture prevent all upload, even with identical source',async()=>{
 const f=fixture();let reads=0;
 await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>reads++?{...f.row,published_bundle_path:f.selection.releaseRoot.replace('bbb','ccc')}:f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload:unused}),{code:'repair_release_changed'});
});
test('preview attached by another worker during capture is retained without another upload',async()=>{
 const f=fixture();const result=await repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>{f.row.preview_video=[videoRow(f.row,f.selection.releaseRoot)];return clip;},upload:unused});
 assert.equal(result.status,'already_ready');
});
test('recording and upload failures never claim, publish, or report success',async()=>{
 const f=fixture();await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>{throw Error('no_motion');},upload:unused}));
 let uploads=0;await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload:async()=>{uploads++;return false;},delay:async()=>{}}),{code:'repair_attachment_failed'});
 assert.equal(uploads,4);
});
test('API health failure stops upload retries immediately',async()=>{
 const f=fixture();let uploads=0;await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload:async()=>{uploads++;throw new ApiHealthFailure();},delay:unused}),ApiHealthFailure);
 assert.equal(uploads,1);
});
test('claimed upload success without an actual current video receipt is not success',async()=>{
 const f=fixture();await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload:async()=>true}),{code:'repair_receipt_missing'});
});
test('normal OIDC uploader checks current video before each write and does not overwrite a newly attached video',async()=>{
 const f=fixture();let checks=0,writes=0;
 const ok=await uploadRepairVideo({receipt:{game_id:f.row.id,release_root:f.selection.releaseRoot},clip,key:'d'.repeat(32),checkCurrent:async()=>++checks===3},
  {health:async()=>{},getToken:async()=>'test-token',fetchImpl:async(url,options)=>{writes++;assert.match(url,/kind=poster/);assert.match(url,/release_key=/);assert.equal(options.redirect,'error');return new Response('{"ok":true}');}});
 assert.equal(ok,true);assert.equal(writes,1,'the already uploaded poster is harmless; the competing video is retained');
});
for(const outcome of ['network','timeout_body','server_error','rate_limit'])test(`${outcome} stops media writes without retrying an unknown outcome`,async()=>{
 const f=fixture();let writes=0;
 const upload=args=>uploadRepairVideo(args,{health:async()=>{},getToken:async()=>'test-token',fetchImpl:async()=>{
  writes++;if(outcome==='network')throw new TypeError('private transport details');
  if(outcome==='timeout_body')return new Response('not-json');
  return new Response('{}',{status:outcome==='server_error'?503:429});
 }});
 await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload,delay:unused}),ApiHealthFailure);assert.equal(writes,1);
});
test('CLI is finite, pinned to normal OIDC media upload, with no republish or broad claim path',async()=>{
 const source=await readFile(new URL('../scripts/mcp-publisher/repair-video.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\/publisher\/claim|\/publisher\/videos\/claim|\/finish|service_role|SUPABASE_SERVICE|send_draft/);
 assert.match(source,/ACTIONS_ID_TOKEN_REQUEST_URL/);assert.match(source,/release_key:receipt\.release_root/);assert.match(source,/if\(await checkCurrent\(\)\)return true/);
});
