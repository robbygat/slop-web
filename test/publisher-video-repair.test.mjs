import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gameTemplate} from '../mcp/game-template.mjs';
import {recorderManifest,recorderFileBytes} from '../scripts/mcp-publisher/world-recorder.mjs';
import {repairSelection,loadRepairBundle,repairOneVideo,boundedResponseBytes,uploadRepairVideo,repairDiagnostic,runRepairCli,RepairFailure} from '../scripts/mcp-publisher/repair-video.mjs';
import {ApiHealthFailure} from '../scripts/mcp-publisher/safety.mjs';
import {VideoFailure} from '../scripts/mcp-publisher/video.mjs';

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
test('repair progress identifies the last operation without source or identity in the events',async()=>{
 const f=fixture(),stages=[];
 await repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>clip,upload:async({key})=>{f.row.preview_video=[videoRow(f.row,f.selection.releaseRoot,key)];return true;},progress:stage=>stages.push(stage)});
 assert.deepEqual(stages,['catalog','source','recording','revalidate','attach','postflight','complete']);
 const stopped=[];f.row.preview_video=null;
 await assert.rejects(repairOneVideo(f.selection,{readGame:async()=>f.row,fetchImpl:f.fetchImpl,record:async()=>{throw new VideoFailure('boot_error');},upload:unused,progress:stage=>stopped.push(stage)}));
 assert.deepEqual(stopped,['catalog','source','recording']);
});
test('diagnostics preserve fixed recorder codes but redact arbitrary errors and Chrome stderr',()=>{
 for(const code of ['not_ready','boot_error','clock_unavailable','blank_canvas','no_motion','runtime_invalid','world_manifest_required','unstable_gameplay'])assert.equal(repairDiagnostic(new VideoFailure(code),'recording').code,code);
 assert.equal(repairDiagnostic(new RepairFailure('repair_asset_integrity'),'source').code,'repair_asset_integrity');
 assert.equal(repairDiagnostic(new ApiHealthFailure(),'attach').code,'api_unhealthy');
 for(const error of [new VideoFailure('PRIVATE_SOURCE_SENTINEL'),new RepairFailure('PRIVATE_SOURCE_SENTINEL'),new Error('PRIVATE_SOURCE_SENTINEL'),Object.assign(new Error('PRIVATE_SOURCE_SENTINEL'),{name:'PRIVATE_SOURCE_SENTINEL'}),new Error('Chrome did not start: PRIVATE_SOURCE_SENTINEL')]){
  assert.doesNotMatch(JSON.stringify(repairDiagnostic(error,'PRIVATE_SOURCE_SENTINEL')),/PRIVATE_SOURCE_SENTINEL/);
 }
 assert.deepEqual(repairDiagnostic(new Error('Chrome did not start: private/path: No usable sandbox! secret'), 'recording'),{stage:'recording',code:'chrome_start_failed',error:'Error',cause:'sandbox_unavailable'});
 assert.equal(repairDiagnostic(new Error('Chrome did not start: error while loading shared libraries: private.so'),'recording').cause,'missing_dependency');
 assert.equal(repairDiagnostic(new Error('Chrome did not start: Cannot allocate memory private detail'),'recording').cause,'resource_unavailable');
 assert.equal(repairDiagnostic(new Error('Chrome did not start: private stderr'),'recording').cause,'unknown');
 assert.equal(repairDiagnostic(Object.assign(new Error('private path'),{code:'ENOENT'}),'recording').cause,'missing_file');
 assert.equal(repairDiagnostic(Object.assign(new Error('private path'),{code:'EPERM'}),'recording').cause,'access_denied');
 assert.equal(repairDiagnostic(new DOMException('private URL','TimeoutError'),'source').code,'operation_timeout');
});
test('CLI flushes ordered, bounded progress and error output before exiting once',async()=>{
 const lines=[],exits=[];
 await runRepairCli({run:async progress=>{progress('recording');progress('PRIVATE_SOURCE_SENTINEL');throw new VideoFailure('no_motion');},write:async line=>{await Promise.resolve();lines.push(line);},exit:code=>{assert.equal(lines.length,3);exits.push(code);}});
 assert.deepEqual(exits,[1]);assert.doesNotMatch(lines.join('\n'),/PRIVATE_SOURCE_SENTINEL/);
 assert.deepEqual(lines.map(line=>JSON.parse(line.slice('video repair: '.length)).stage),['selection','recording','recording']);
 assert.equal(JSON.parse(lines.at(-1).slice('video repair: '.length)).code,'no_motion');
 const success=[];await runRepairCli({run:async()=>({status:'already_ready'}),write:async line=>success.push(line),exit:code=>assert.equal(code,0)});
 assert.match(success.at(-1),/already_ready/);
});
test('CLI terminates on success and error even with an outstanding recorder-style handle',async()=>{
 const moduleUrl=new URL('../scripts/mcp-publisher/repair-video.mjs',import.meta.url).href;
 for(const failure of [false,true]){
  const code=`import {runRepairCli} from ${JSON.stringify(moduleUrl)};setInterval(()=>{},1000);await runRepairCli({run:async progress=>{progress('recording');${failure?"throw new Error('Chrome did not start: PRIVATE_SOURCE_SENTINEL');":"return {status:'already_ready'};"}}});`;
  try{
   const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{timeout:5000,maxBuffer:10000});
   assert.equal(failure,false);assert.match(result.stdout,/already_ready/);
  }catch(error){assert.equal(failure,true);assert.equal(error.killed,false);assert.equal(error.code,1);assert.match(error.stdout,/chrome_start_failed/);assert.doesNotMatch(error.stdout+error.stderr,/PRIVATE_SOURCE_SENTINEL/);}
 }
});
test('CLI still exits when diagnostic output fails',async()=>{
 const exits=[];await runRepairCli({run:async()=>({status:'already_ready'}),write:async()=>{throw Error('closed output');},exit:code=>exits.push(code)});assert.deepEqual(exits,[1]);
});
test('importing the repair library neither runs the CLI nor terminates its caller',async()=>{
 const moduleUrl=new URL('../scripts/mcp-publisher/repair-video.mjs',import.meta.url).href;
 await assert.rejects(promisify(execFile)(process.execPath,['--input-type=module','-e',`import ${JSON.stringify(moduleUrl)};console.log('importer-alive');setInterval(()=>{},1000);`],{timeout:750,maxBuffer:10000}),error=>{
  assert.equal(error.killed,true);assert.equal(error.signal,'SIGTERM');assert.equal(error.stdout.trim(),'importer-alive');assert.equal(error.stderr,'');return true;
 });
});
