// One explicitly selected, already-published World. Never claims jobs,
// republishes a game, or scans the catalog. Logs contain fixed codes only.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {mcpPublicationReceipt} from '../../src/lib/mcp-publication-contracts.js';
import {mcpTargetFromFiles} from '../../src/lib/mcp-platform.js';
import {UUID,DIGEST,previewVideo} from '../../src/lib/contracts.js';
import {PERSISTENT_BUDGET} from '../../mcp/bundle-rules.mjs';
import {attachPublishedVideo} from './completion.mjs';
import {recorderWorldConfig,recorderManifest} from './world-recorder.mjs';
import {checkApiHealth,ApiHealthFailure,PUBLISHABLE_KEY} from './safety.mjs';
import {VideoFailure} from './video.mjs';

const API='https://api.slop.game/functions/v1/slop-mcp';
const STORAGE='https://api.slop.game/storage/v1/object/public/games/';
const PATH=/^1\.0\.0\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:html|js|css|json|svg|txt|glb|bin|jpg|webp|ktx2|ogg)$/;
const BINARY=/\.(?:glb|bin|jpg|webp|ktx2|ogg)$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export class RepairFailure extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new RepairFailure(code);};
const STAGES=new Set(['selection','catalog','source','recording','revalidate','attach','postflight','complete']);
const REPAIR_CODES=new Set(['repair_selection_invalid','repair_release_changed','repair_source_mismatch','repair_fetch_failed','repair_asset_size','repair_bundle_bounds','repair_asset_integrity','repair_text_invalid','repair_runtime_invalid','repair_attachment_failed','repair_receipt_missing','repair_catalog_invalid','repair_oidc_unavailable']);
const VIDEO_CODES=new Set(['runtime_invalid','world_manifest_required','not_ready','boot_error','clock_unavailable','recorder_error','blank_canvas','no_motion','unstable_gameplay']);
// The repository/workflow logs are public. Never expose arbitrary messages,
// stacks, Chrome stderr, request URLs, game text or environment values.
export function repairDiagnostic(error,stage){
 let code='recorder_error',cause='unknown';
 if(error instanceof RepairFailure&&REPAIR_CODES.has(error.code))code=error.code;
 else if(error instanceof ApiHealthFailure)code='api_unhealthy';
 else if(error instanceof VideoFailure&&VIDEO_CODES.has(error.code))code=error.code;
 else if(error instanceof Error&&error.message.startsWith('Chrome did not start:')){
  code='chrome_start_failed';
  if(/No usable sandbox|sandbox.*(?:denied|not permitted)|Running as root without --no-sandbox/i.test(error.message))cause='sandbox_unavailable';
  else if(/error while loading shared libraries|cannot open shared object/i.test(error.message))cause='missing_dependency';
  else if(/Cannot allocate memory|Resource temporarily unavailable|Too many open files|No space left/i.test(error.message))cause='resource_unavailable';
 }else if(error?.name==='TimeoutError'||error?.name==='AbortError')code='operation_timeout';
 else if(['ENOENT','EACCES','EPERM','ENOMEM','EMFILE'].includes(error?.code)){
  code='recorder_environment';cause={ENOENT:'missing_file',EACCES:'access_denied',EPERM:'access_denied',ENOMEM:'resource_unavailable',EMFILE:'resource_unavailable'}[error.code];
 }
 const name=['Error','TypeError','RangeError','SyntaxError','TimeoutError','AbortError'].includes(error?.name)?error.name:'Error';
 return {stage:STAGES.has(stage)?stage:'selection',code,error:name,cause};
}
export async function runRepairCli({run,write=line=>new Promise((resolve,reject)=>process.stdout.write(`${line}\n`,error=>error?reject(error):resolve())),exit=code=>process.exit(code)}){
 let stage='selection',status=0,output=Promise.resolve();
 const emit=value=>{output=output.then(()=>write(`video repair: ${JSON.stringify(value)}`));};
 const progress=value=>{if(STAGES.has(value)){stage=value;emit({stage});}};
 try{progress(stage);const result=await run(progress);emit(result);}
 catch(error){status=1;emit(repairDiagnostic(error,stage));}
 // recordVideo can fail before its cleanup scope (e.g. Chrome cannot start),
 // leaving its local HTTP server open. Flush bounded logs, then terminate this
 // one-shot CLI, as the ordinary publisher does. Imports never exit the caller.
 try{await output;}catch{status=1;}finally{exit(status);}
}

export function repairSelection({slug,sourceDigest,releaseRoot}={}){
 if(typeof slug!=='string'||!/^mcp-[a-f0-9]{32}$/.test(slug)||!DIGEST.test(sourceDigest||'')||
    typeof releaseRoot!=='string'||!new RegExp(`^releases/[a-f0-9]{64}/${slug}$`).test(releaseRoot))fail('repair_selection_invalid');
 return Object.freeze({slug,sourceDigest,releaseRoot});
}
async function attest(row,selection){
 if(!row||!UUID.test(row.id||'')||!UUID.test(row.owner_id||'')||row.media_delete_authorized!==false||row.persistent!==true||row.bundle_version!=='1.0.0'||row.published_bundle_path!==selection.releaseRoot)fail('repair_release_changed');
 const receipt=await mcpPublicationReceipt(row,{slug:selection.slug,game_id:row.id,owner_id:row.owner_id,digest:selection.sourceDigest});
 if(!receipt||receipt.release_root!==selection.releaseRoot)fail('repair_source_mismatch');
 return receipt;
}
function currentVideo(row,selection,key){
 const videos=Array.isArray(row?.preview_video)?row.preview_video:row?.preview_video?[row.preview_video]:[];
 return videos.some(video=>video.game_id===row.id&&video.release_key===selection.releaseRoot&&
  new RegExp(`^${row.id}/v1-[a-f0-9]{32}/preview\\.mp4$`).test(video.video_path||'')&&video.poster_path===video.video_path.replace(/preview\.mp4$/,'poster.jpg')&&
  previewVideo({preview_video:video})&&(!key||video.video_path===`${row.id}/v1-${key}/preview.mp4`));
}
export async function boundedResponseBytes(response,limit){
 if(!response?.ok||!response.body)fail('repair_fetch_failed');
 const length=response.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>limit))fail('repair_asset_size');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{
  for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)fail('repair_asset_size');chunks.push(value);}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(chunks,size);
}

// Only immutable source paths from the attested complete publication manifest.
// Published covers/previews are not source; no other directory is omitted.
export async function loadRepairBundle(row,selection,{fetchImpl=fetch}={}){
 selection=repairSelection(selection);await attest(row,selection);
 const source=row.bundle_manifest.filter(file=>!/^1\.0\.0\/(covers|previews)\//.test(file.path));
 if(source.length>PERSISTENT_BUDGET.files||source.some(file=>!PATH.test(file.path)||file.path.length>166||file.path.includes('..')||file.bytes>PERSISTENT_BUDGET.file)||
    source.reduce((sum,file)=>sum+file.bytes,0)>PERSISTENT_BUDGET.total)fail('repair_bundle_bounds');
 const files={},controller=new AbortController(),deadline=AbortSignal.timeout(120000);let cursor=0;
 const worker=async()=>{
  while(cursor<source.length){
   const file=source[cursor++],url=`${STORAGE}${selection.releaseRoot}/${file.path}`;
   const response=await fetchImpl(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.any([controller.signal,deadline,AbortSignal.timeout(25000)])});
   const bytes=await boundedResponseBytes(response,file.bytes);
   if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)fail('repair_asset_integrity');
   const path=file.path.slice('1.0.0/'.length);
   try{files[path]=BINARY.test(path)?{encoding:'base64',data:bytes.toString('base64')}:new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('repair_text_invalid');}
  }
 };
 try{await Promise.all(Array.from({length:Math.min(3,source.length)},worker));}catch(error){controller.abort();throw error;}
 try{
  if(!recorderWorldConfig(files))fail('repair_runtime_invalid');
  const manifest=recorderManifest(files);
  if(hash(manifest.map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'))!==selection.sourceDigest)fail('repair_source_mismatch');
  return {files,target:mcpTargetFromFiles(files),count:source.length,bytes:source.reduce((sum,file)=>sum+file.bytes,0)};
 }catch(error){if(error instanceof RepairFailure)throw error;fail('repair_runtime_invalid');}
}

// All dependencies are injectable for offline tests. The default CLI wires only
// public reads, the existing recorder and the normal OIDC media endpoint.
export async function repairOneVideo(input,{readGame,fetchImpl,record,upload,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),progress=()=>{}}){
 const selection=repairSelection(input);progress('catalog');
 const row=await readGame(selection.slug),initial=await attest(row,selection);
 if(currentVideo(row,selection))return {status:'already_ready'};
 progress('source');
 const bundle=await loadRepairBundle(row,selection,{fetchImpl}),diagnostics={};
 progress('recording');
 const clip=await record({files:bundle.files},{target:bundle.target,diagnostics,seed:parseInt(row.id.replaceAll('-','').slice(0,8),16)||1});
 const key=hash(clip.video).slice(0,32);
 const readPinned=async()=>{
  const latest=await readGame(selection.slug),receipt=await attest(latest,selection);
  if(receipt.game_id!==initial.game_id||receipt.owner_id!==initial.owner_id)fail('repair_release_changed');
  return latest;
 };
 // Refuse release drift before requesting any authority or media write.
 progress('revalidate');
 const latest=await readPinned();
 if(currentVideo(latest,selection))return {status:'already_ready'};
 progress('attach');
 const attached=await attachPublishedVideo({slug:selection.slug,sourceDigest:selection.sourceDigest,
  readGame:readPinned,delay,
  upload:async receipt=>{
   if(receipt.game_id!==initial.game_id||receipt.release_root!==selection.releaseRoot)return false;
   const before=await readPinned();if(currentVideo(before,selection))return true;
   return upload({receipt,clip,key,checkCurrent:async()=>currentVideo(await readPinned(),selection)});
  }});
 if(!attached)fail('repair_attachment_failed');
 progress('postflight');
 const observed=await readPinned();
 if(!currentVideo(observed,selection))fail('repair_receipt_missing');
 progress('complete');
 return {status:'attached',files:bundle.count,bytes:bundle.bytes,width:clip.width,height:clip.height,durationMs:clip.durationMs,videoBytes:clip.video.length,
  frames:diagnostics.frames,moving:diagnostics.moving,lit:diagnostics.lit,errors:diagnostics.errors};
}

async function publicGame(slug){
 await checkApiHealth();
 const select='id,owner_id,slug,status,media_delete_authorized,persistent,bundle_version,published_bundle_path,bundle_digest,bundle_manifest,preview_video:game_preview_videos(game_id,release_key,video_path,poster_path,width,height,duration_ms)';
 const query=new URLSearchParams({slug:`eq.${slug}`,status:'eq.published',media_delete_authorized:'eq.false',select,limit:'2'});
 const response=await fetch(`https://api.slop.game/rest/v1/games?${query}`,{headers:{apikey:PUBLISHABLE_KEY},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
 const bytes=await boundedResponseBytes(response,1000000);let rows;try{rows=JSON.parse(bytes);}catch{fail('repair_catalog_invalid');}
 if(!Array.isArray(rows)||rows.length!==1)fail('repair_catalog_invalid');return rows[0];
}
async function oidcToken(){
 const raw=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,token=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!raw||!token)fail('repair_oidc_unavailable');
 const url=new URL(raw);url.searchParams.set('audience',API);
 if(url.protocol!=='https:'||url.username||url.password||!url.hostname.endsWith('.actions.githubusercontent.com'))fail('repair_oidc_unavailable');
 const response=await fetch(url,{headers:{Authorization:`bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)});
 const bytes=await boundedResponseBytes(response,65536);let body;try{body=JSON.parse(bytes);}catch{fail('repair_oidc_unavailable');}
 if(typeof body?.value!=='string'||!body.value)fail('repair_oidc_unavailable');return body.value;
}
export async function uploadRepairVideo({receipt,clip,key,checkCurrent},{health=checkApiHealth,getToken=oidcToken,fetchImpl=fetch}={}){
 if(await checkCurrent())return true;
 await health();const token=await getToken();
 for(const kind of ['poster','video']){
  if(await checkCurrent())return true;
  await health();
  const query=new URLSearchParams({kind,key,release_key:receipt.release_root,...(kind==='video'?{poster_bytes:String(clip.poster.length)}:{})});
  let response;
  try{response=await fetchImpl(`${API}/publisher/videos/${receipt.game_id}/media?${query}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'content-type':kind==='poster'?'image/jpeg':'video/mp4'},body:clip[kind],signal:AbortSignal.timeout(170000)});}catch{throw new ApiHealthFailure();}
  if(!response.ok){if(response.status>=500||response.status===429)throw new ApiHealthFailure();return false;}
  let body;try{body=JSON.parse(await boundedResponseBytes(response,65536));}catch{throw new ApiHealthFailure();}
  if(body?.ok!==true)return false;
 }
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 await runRepairCli({run:async progress=>{
  const {recordVideo}=await import('./video.mjs');
  return repairOneVideo({slug:process.env.SLOP_REPAIR_SLUG,sourceDigest:process.env.SLOP_REPAIR_SOURCE_DIGEST,releaseRoot:process.env.SLOP_REPAIR_RELEASE_ROOT},
   {readGame:publicGame,record:recordVideo,upload:uploadRepairVideo,progress});
 }});
}
