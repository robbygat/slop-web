import {asOwner,result,request,getSession,ownRpc} from './supabase.js';
import {SlopError,UUID,trustedEntry} from './contracts.js';
import {bundleIdentity,mime,sha256} from './bundle-contracts.js';
import {futureExpiry,publicationReceipt} from './creator-contracts.js';
import {validCaptureDimensions} from './capture-contracts.js';
export const creator=(path,body,options={})=>request('slop-creator',path,{body,...options});
function verify(expected){if(getSession()?.epoch!==expected.epoch)throw new SlopError('account_changed');}
async function reserve(client,owner,slug,objects){
 const r=await result(client.rpc('reserve_game_draft_upload',{p_slug:slug,p_objects:objects}));
 if(r?.owner_id!==owner||r.slug!==slug||r.object_count!==objects.length||!UUID.test(r.upload_id)||!futureExpiry(r.expires_at,11*60_000))throw new SlopError('invalid_response');
 return {slop_upload_id:r.upload_id};
}
const preparedPreviews=new Map();
export async function privatePreview(project,revision,slugOverride){
 const owner=getSession();if(!owner||project.owner_id!==owner.user.id)throw new SlopError('account_changed');
 const key=[owner.user.id,owner.epoch,project.id,revision.id,revision.digest,slugOverride||'preview'].join(':');
 const cached=preparedPreviews.get(key);if(cached&&cached.until>Date.now()){const prepared=await cached.work;verify(owner);return prepared;}
 const work=preparePrivatePreview(project,revision,slugOverride);
 preparedPreviews.set(key,{work,until:Date.now()+12*60_000});
 if(preparedPreviews.size>12)preparedPreviews.delete(preparedPreviews.keys().next().value);
 try{const prepared=await work;verify(owner);return prepared;}catch(error){if(preparedPreviews.get(key)?.work===work)preparedPreviews.delete(key);throw error;}
}
async function preparePrivatePreview(project,revision,slugOverride){
 const expected=getSession();if(!expected||project.owner_id!==expected.user.id||revision.project_id!==project.id)throw new SlopError('account_changed');
 if(!UUID.test(project.id)||!UUID.test(revision.id))throw new SlopError('invalid_response');
 const files=Object.freeze({...revision.files});
 const identity=await bundleIdentity(files);verify(expected);
 const slug=slugOverride||`creator-preview-${project.id}-${revision.id}`;
 const url=await asOwner(async(owner,client)=>{
  let row=await result(client.from('games').select('id,owner_id,status').eq('slug',slug).maybeSingle());verify(expected);
  if(!row){row=await result(client.from('games').insert({slug,owner_id:owner,status:'draft',name:project.title||'My Slop game',description:'A private creator playtest',prompt:'Created in Slop',html:'<!doctype html><html><body>Open this private draft in Slop.</body></html>'}).select('id,owner_id,status').single());verify(expected);}
  if(row.owner_id!==owner||row.status!=='draft')throw new SlopError('invalid_response');
  const entries=Object.entries(files);
  const metadata=await reserve(client,owner,slug,entries.map(([path,body])=>({path:`${slug}/1.0.0/${path}`,bytes:new TextEncoder().encode(body).length,content_type:mime(path)})));verify(expected);
  // Sequential chunks bound uploads and stop immediately on any failure.
  for(let i=0;i<entries.length;i+=4){verify(expected);await Promise.all(entries.slice(i,i+4).map(([path,body])=>result(client.storage.from('game-drafts').upload(`${slug}/1.0.0/${path}`,new TextEncoder().encode(body),{contentType:mime(path),metadata,upsert:true,cacheControl:'0'}))));verify(expected);}
  const receipt=await request('game-bundle','/',{ownerReceipt:false,body:{action:'preview',slug,version:'1.0.0',expected_bundle_digest:identity.digest,expected_bundle_manifest:identity.manifest}});
  if(receipt.ok!==true||!trustedEntry(receipt.url,{preview:true,slug})||!futureExpiry(receipt.expires_at,16*60_000))throw new SlopError('invalid_response');
  return receipt.url;
 });verify(expected);return {url,identity,slug};
}
export async function uploadMedia(client,owner,slug,path,bytes,type){
 const metadata=await reserve(client,owner,slug,[{path,bytes:bytes.length,content_type:type}]);
 const {error}=await client.storage.from('game-drafts').upload(path,bytes,{contentType:type,metadata,cacheControl:'31536000',upsert:false});
 if(error&&Number(error.statusCode)!==409)throw new SlopError(error.code,error.message);
 // Content-addressed retries must prove bytes, rather than trust a 409.
 const stored=await result(client.storage.from('game-drafts').download(path));
 const actual=new Uint8Array(await stored.arrayBuffer());
 if(actual.length!==bytes.length||await sha256(actual)!==await sha256(bytes))throw new Error('The uploaded gameplay preview could not be verified.');
 return path;
}
export async function publishRevision({project,revision,title,tagline,prompt,cover,gif,frameCount,width,height,onStage}){
 const expected=getSession();if(!expected||project.owner_id!==expected.user.id||project.head_revision_id!==revision.id||revision.project_id!==project.id)throw new Error('Finish playtesting the latest version before publishing.');
 if(!cover?.length||cover.length>700*1024||!gif?.length||gif.length>2*1024*1024||frameCount<3||frameCount>40||!validCaptureDimensions(width,height))throw new Error('Record a cover and a short gameplay clip before publishing.');
 if(!UUID.test(project.id)||!UUID.test(revision.id))throw new SlopError('invalid_response');
 const files=Object.freeze({...revision.files});
 const doc=new DOMParser().parseFromString(files['index.html']||'','text/html');
 if(!doc.head.querySelector('meta[name="slop-runtime"][content="creator-v1"]')||!files['slop.js']?.trim())throw new Error('This version has no verified creator runtime. Rebuild it before publishing.');
 const identity=await bundleIdentity(files);verify(expected);const slug=`creator-release-${revision.id}`;
 const parameters={p_project_id:project.id,p_revision_id:revision.id,p_build_id:identity.buildId,p_title:title,p_tagline:tagline,p_prompt:prompt};
 const prepare=async()=>{verify(expected);const receipt=await ownRpc('prepare_creator_game_publication',parameters);verify(expected);return receipt;};
 onStage?.('Preparing your game…');const prepared=await prepare();verify(expected);
 const checkReceipt=p=>publicationReceipt(p,{project,revision,buildId:identity.buildId});
 if(checkReceipt(prepared))return prepared;
 if(prepared.status!=='draft')throw new SlopError('invalid_response');
 onStage?.('Uploading this exact version…');await privatePreview(project,{...revision,files},slug);verify(expected);
 await asOwner(async(owner,client)=>{
  const game=await result(client.from('games').select('id,owner_id,status').eq('slug',slug).single());verify(expected);
  if(game.owner_id!==owner||game.status!=='draft')throw new SlopError('invalid_response');
  const coverPath=`${slug}/1.0.0/covers/${game.id}/${identity.buildId}-c3-${(await sha256(cover)).slice(0,32)}/cover.jpg`;
  onStage?.('Saving your cover…');await uploadMedia(client,owner,slug,coverPath,cover,'image/jpeg');verify(expected);
  const coverReceipt=await result(client.rpc('record_game_cover',{p_slug:slug,p_version:'1.0.0',p_path:coverPath,p_bytes:cover.length}));verify(expected);if(coverReceipt!==coverPath)throw new SlopError('invalid_response');
  const clipPath=`${slug}/1.0.0/previews/${game.id}/${identity.buildId}-c3-${(await sha256(gif)).slice(0,32)}/preview.gif`;
  onStage?.('Saving your gameplay clip…');await uploadMedia(client,owner,slug,clipPath,gif,'image/gif');verify(expected);
  const clip=await result(client.rpc('record_game_preview',{p_slug:slug,p_version:'1.0.0',p_build_id:identity.buildId,p_path:clipPath,p_width:width,p_height:height,p_frame_count:frameCount,p_bytes:gif.length}));verify(expected);
  if(clip?.saved!==true||clip.slug!==slug||clip.path!==clipPath||clip.build_id!==identity.buildId||clip.bytes!==gif.length)throw new SlopError('invalid_response');
  await result(client.from('games').update({name:title,description:tagline,prompt,html:files['index.html'],draft_of:project.game_slug,...(project.remix_of_slug?{remix_of:project.remix_of_slug}:{}),...(project.root_game_slug?{root_game_slug:project.root_game_slug}:{})}).eq('slug',slug).eq('owner_id',owner).eq('status','draft').select('id').single());verify(expected);
 });
 onStage?.('Sending to Slop for review…');
 try{await request('game-bundle','/',{ownerReceipt:false,body:{action:'submit_review',slug}});}catch(e){const recovered=await prepare();if(checkReceipt(recovered))return recovered;throw e;}
 const receipt=await prepare();verify(expected);if(!checkReceipt(receipt))throw new Error('Your submission has not been confirmed. Refresh before retrying.');return receipt;
}
