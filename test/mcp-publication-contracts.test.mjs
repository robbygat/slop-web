import test from'node:test';import assert from'node:assert/strict';import{mcpInboxState,mcpPublicationReceipt}from'../src/lib/mcp-publication-contracts.js';import{bundleIdentity,sha256}from'../src/lib/bundle-contracts.js';import{gameTemplate}from'../mcp/game-template.mjs';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',nonce='33333333-3333-4333-8333-333333333333',slug='mcp-'+'a'.repeat(32);
async function fixture(){const{files}=await gameTemplate(),identity=await bundleIdentity(files);const manifest=[...identity.manifest,{path:'1.0.0/covers/id/build/cover.jpg',bytes:100,sha256:'1'.repeat(64)},{path:'1.0.0/previews/id/build/preview.gif',bytes:200,sha256:'2'.repeat(64)}].sort((a,b)=>a.path<b.path?-1:1);return{preview:{game_id:id,owner_id:owner,slug,digest:identity.digest},row:{id,owner_id:owner,slug,status:'published',review_submission_id:null,published_bundle_path:'releases/'+'b'.repeat(64)+'/'+slug,bundle_manifest:manifest,bundle_digest:await sha256(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n'))}};}
test('pending MCP publication needs the correct owner, game and actual queue nonce',async()=>{const{preview,row}=await fixture();row.status='pending_review';assert.equal(await mcpPublicationReceipt(row,preview),null);row.review_submission_id=nonce;assert.equal((await mcpPublicationReceipt(row,preview)).review_submission_id,nonce);assert.equal(await mcpPublicationReceipt({...row,owner_id:id},preview),null);});
test('published MCP recovery accepts a cleared nonce only with the protected exact-source release',async()=>{const{preview,row}=await fixture();const receipt=await mcpPublicationReceipt(row,preview);assert.equal(receipt.status,'published');assert.equal(receipt.review_submission_id,null);assert.equal(receipt.release_root,row.published_bundle_path);for(const broken of[{published_bundle_path:'https://elsewhere/game'},{bundle_digest:'0'.repeat(64)},{bundle_manifest:[...row.bundle_manifest,row.bundle_manifest[0]]}])assert.equal(await mcpPublicationReceipt({...row,...broken},preview),null);assert.equal(await mcpPublicationReceipt(row,{...preview,digest:'9'.repeat(64)}),null);});
test('an MCP game withdrawn for an update stays the update target, a fresh placeholder does not',()=>{
 const release='releases/'+'b'.repeat(64)+'/mcp-'+'a'.repeat(32);
 assert.equal(mcpInboxState({status:'published',published_bundle_path:release}),'published');
 assert.equal(mcpInboxState({status:'draft',published_bundle_path:release}),'updating');
 // withdraw_public clears the release pointer but keeps the captured cover and clip
 assert.equal(mcpInboxState({status:'draft',published_bundle_path:null,thumb:'mcp-x/1.0.0/covers/c.jpg',preview_url:'mcp-x/1.0.0/previews/p.gif'}),'updating');
 assert.equal(mcpInboxState({status:'draft',published_bundle_path:null,thumb:null,preview_url:null}),'draft');
 assert.equal(mcpInboxState({status:'draft',thumb:'only-a-cover.jpg',preview_url:null}),'draft');
 for(const status of['pending_review','private','rejected'])assert.equal(mcpInboxState({status,thumb:'c',preview_url:'p'}),status);
});

test('missing preview survives reload and only current owner/release MP4 satisfies it',async()=>{
 const{row}=await fixture();row.name='Current game';
 const {mcpInboxPreview}=await import('../src/lib/mcp-publication-contracts.js');
 const video={game_id:id,release_key:row.published_bundle_path,video_path:`${id}/v1-${'1'.repeat(32)}/preview.mp4`};
 assert.equal(mcpInboxPreview(row,owner).hasVideo,false);
 assert.equal(mcpInboxPreview({...row,preview_video:video},owner).hasVideo,true);
 assert.equal(mcpInboxPreview({...row,preview_video:[video]},owner).hasVideo,true);
 for(const wrong of [{release_key:'old-release'},{game_id:owner},{video_path:video.video_path.replace('mp4','gif')}]){
  assert.equal(mcpInboxPreview({...row,preview_video:{...video,...wrong}},owner).hasVideo,false);
 }
 assert.equal(mcpInboxPreview(row,id),null);
 assert.equal(mcpInboxPreview({...row,status:'pending_review'},owner),null);
 assert.equal(mcpInboxPreview({...row,published_bundle_path:'https://untrusted/game'},owner),null);
});

test('interrupted update reuses only its exact source and permanent target receipt',async()=>{
 const{row,preview}=await fixture();const{mcpUpdateReceipt}=await import('../src/lib/mcp-publication-contracts.js');
 const target={game_id:id,slug};const update={...preview,game_id:nonce,slug:'mcp-'+'c'.repeat(32)};
 const receipt=await mcpUpdateReceipt(row,update,target);
 assert.equal(receipt.release_root,row.published_bundle_path);assert.equal(receipt.updated,true);assert.equal(receipt.game_id,id);
 for(const invalid of[{...row,owner_id:nonce},{...row,id:nonce},{...row,bundle_digest:'0'.repeat(64)}])assert.equal(await mcpUpdateReceipt(invalid,update,target),null);
 assert.equal(await mcpUpdateReceipt(row,{...update,digest:'0'.repeat(64)},target),null);
 const pending={...row,status:'pending_review',review_submission_id:nonce};
 assert.equal((await mcpUpdateReceipt(pending,update,target)).status,'pending_review');
 assert.equal(await mcpUpdateReceipt(pending,{...update,digest:'0'.repeat(64)},target),null);
});
