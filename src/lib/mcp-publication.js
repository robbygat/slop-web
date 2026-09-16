import {asOwner,result,getSession,mcpRequest,request} from './supabase.js';
import {SlopError,UUID,DIGEST,trustedEntry} from './contracts.js';
import {bundleIdentity,sha256} from './bundle-contracts.js';
import {uploadMedia} from './creator.js';
import {validCaptureDimensions} from './capture-contracts.js';
import {mcpRuntimeProblem} from './mcp-runtime.js';
import {mcpPublicationReceipt} from './mcp-publication-contracts.js';
const stateFields='id,owner_id,slug,status,review_submission_id,published_bundle_path,bundle_digest,bundle_manifest';
function assertCurrent(expected){if(!expected||getSession()?.epoch!==expected.epoch)throw new SlopError('account_changed');}
function validPreview(p,owner){return p?.owner_id===owner&&UUID.test(p.submission_id)&&UUID.test(p.game_id)&&DIGEST.test(p.digest)&&/^mcp-[a-f0-9]{32}$/.test(p.slug)&&p.status==='ready'&&trustedEntry(p.preview_url,{preview:true,slug:p.slug});}
async function gameState(client,owner,p){const game=await result(client.from('games').select(stateFields).eq('id',p.game_id).eq('slug',p.slug).eq('owner_id',owner).single());if(game.owner_id!==owner||game.id!==p.game_id||game.slug!==p.slug)throw new SlopError('invalid_response');return game;}

async function sourceFiles(client,slug,expected){
 const queue=[''],paths=[];let directories=0;const prefix=slug+'/1.0.0/';
 while(queue.length){assertCurrent(expected);if(++directories>96)throw new SlopError('invalid_response');const directory=queue.shift();const rows=await result(client.storage.from('game-drafts').list(prefix+directory,{limit:100,sortBy:{column:'name',order:'asc'}}));
  if(rows.length>=100)throw new SlopError('invalid_response');for(const row of rows){const path=directory+row.name;if(!directory&&['covers','previews'].includes(row.name))continue;if(!/^[A-Za-z0-9_.-]+$/.test(row.name)||row.name.includes('..'))throw new SlopError('invalid_response');if(row.id==null){queue.push(path+'/');continue;}if(!/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:html|js|css|json|svg|txt)$/.test(path)||paths.length>=64)throw new SlopError('invalid_response');paths.push(path);}
 }
 const files={};let total=0;for(const path of paths.sort()){assertCurrent(expected);const blob=await result(client.storage.from('game-drafts').download(prefix+path));if(!blob.size||blob.size>512000||(total+=blob.size)>2000000)throw new SlopError('invalid_response');files[path]=new TextDecoder('utf-8',{fatal:true}).decode(await blob.arrayBuffer());}
 assertCurrent(expected);return files;
}
export async function inspectMcpPublication(preview){
 const expected=getSession();if(!validPreview(preview,expected?.user.id))throw new SlopError('account_changed');
 return asOwner(async(owner,client)=>{const game=await gameState(client,owner,preview);assertCurrent(expected);const receipt=await mcpPublicationReceipt(game,preview);assertCurrent(expected);if(receipt)return {receipt};if(game.status!=='draft')throw new Error('This game is no longer an editable private draft.');
  const latest=await mcpRequest('slop-mcp','/drafts');assertCurrent(expected);const current=latest.submissions?.find(s=>s.submission_id===preview.submission_id);if(!current||current.status!=='ready'||current.digest!==preview.digest||current.slug!==preview.slug||current.game_id!==preview.game_id)throw new Error('The draft changed. Reopen the latest version from your inbox.');
  const files=await sourceFiles(client,preview.slug,expected),identity=await bundleIdentity(files);assertCurrent(expected);if(identity.digest!==preview.digest)throw new Error('The game files changed. Reopen and playtest this version again.');const runtimeError=mcpRuntimeProblem(identity.manifest,files['index.html']);if(runtimeError)throw new Error(runtimeError);return {files,identity,game};
 });
}
export async function prepareMcpPublication({preview,title,tagline,cover,gif,frameCount,width,height,onStage}){
 const expected=getSession();if(!validPreview(preview,expected?.user.id))throw new SlopError('account_changed');
 if(!title?.trim()||title.length>80||typeof tagline!=='string'||tagline.length>240||!cover?.length||cover.length>700*1024||!gif?.length||gif.length>2*1024*1024||!Number.isInteger(frameCount)||frameCount<3||frameCount>40||!validCaptureDimensions(width,height))throw new Error('Add a title and record a gameplay preview before submitting.');
 onStage?.('Checking the version you played…');const checked=await inspectMcpPublication(preview);assertCurrent(expected);if(checked.receipt)return checked;
 const {identity}=checked,slug=preview.slug;
 await asOwner(async(owner,client)=>{
  const game=await gameState(client,owner,preview);if(game.status!=='draft')throw new Error('The draft changed. Reopen it before submitting.');assertCurrent(expected);
  const coverPath=`${slug}/1.0.0/covers/${game.id}/${identity.buildId}-c3-${(await sha256(cover)).slice(0,32)}/cover.jpg`;
  onStage?.('Saving your gameplay cover…');await uploadMedia(client,owner,slug,coverPath,cover,'image/jpeg');assertCurrent(expected);
  const savedCover=await result(client.rpc('record_game_cover',{p_slug:slug,p_version:'1.0.0',p_path:coverPath,p_bytes:cover.length}));if(savedCover!==coverPath)throw new SlopError('invalid_response');assertCurrent(expected);
  const clipPath=`${slug}/1.0.0/previews/${game.id}/${identity.buildId}-c3-${(await sha256(gif)).slice(0,32)}/preview.gif`;
  onStage?.('Saving your gameplay clip…');await uploadMedia(client,owner,slug,clipPath,gif,'image/gif');assertCurrent(expected);
  const clip=await result(client.rpc('record_game_preview',{p_slug:slug,p_version:'1.0.0',p_build_id:identity.buildId,p_path:clipPath,p_width:width,p_height:height,p_frame_count:frameCount,p_bytes:gif.length}));if(clip?.saved!==true||clip.slug!==slug||clip.path!==clipPath||clip.build_id!==identity.buildId||clip.bytes!==gif.length)throw new SlopError('invalid_response');assertCurrent(expected);
  await result(client.from('games').update({name:title.trim(),description:tagline.trim(),prompt:'Created with a connected coding app',html:checked.files['index.html']}).eq('id',game.id).eq('owner_id',owner).eq('status','draft').select('id').single());assertCurrent(expected);
 });return {owner_id:expected.user.id,game_id:preview.game_id,slug,build_id:identity.buildId,digest:identity.digest,status:'draft'};
}
export async function submitMcpPublication(input){
 const expected=getSession(),prepared=await prepareMcpPublication(input);assertCurrent(expected);if(prepared.receipt)return prepared.receipt;
 // Recheck the approved source immediately before the native server freezes it.
 const current=await inspectMcpPublication(input.preview);assertCurrent(expected);if(current.receipt)return current.receipt;if(current.identity.digest!==prepared.digest)throw new Error('The game changed before submission. Playtest the latest version.');
 input.onStage?.('Sending your game for review…');let failure;
 try{const receipt=await request('game-bundle','/',{ownerReceipt:false,body:{action:'submit_review',slug:prepared.slug}});if(receipt.ok!==true||!['pending_review','published'].includes(receipt.status)||!UUID.test(receipt.review_submission_id))throw new SlopError('invalid_response');}catch(error){failure=error;}
 assertCurrent(expected);
 const receipt=await asOwner(async(owner,client)=>mcpPublicationReceipt(await gameState(client,owner,input.preview),input.preview));assertCurrent(expected);
 if(!receipt)throw failure||new Error('Your submission has not been confirmed. Refresh before retrying.');return receipt;
}
export async function mcpGameStates(submissions){
 const ids=submissions.filter(s=>UUID.test(s.game_id)).map(s=>s.game_id);if(!ids.length)return {};
 return asOwner(async(owner,client)=>{const rows=await result(client.from('games').select('id,status').eq('owner_id',owner).in('id',ids));return Object.fromEntries(rows.filter(r=>ids.includes(r.id)).map(r=>[r.id,r.status]));});
}
