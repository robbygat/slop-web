import test from 'node:test';
import assert from 'node:assert/strict';
import {completeMcpPublication,isMcpTransientError,mcpRecoveryError,mcpPublicationLabel} from '../src/lib/mcp-publication-recovery.js';

test('attachment failure retains receipt and retry never republishes',async()=>{
 let saved=null,publishes=0,attachments=0;
 const receipt={status:'published',slug:'same-game',release_root:'same-release'};
 const attempt=()=>completeMcpPublication({receipt:saved,submit:async()=>{publishes++;return receipt;},onReceipt:value=>saved=value,attach:async value=>{assert.equal(value,receipt);assert.equal(saved,receipt);if(++attachments===1)throw new TypeError('Failed to fetch');}});
 await assert.rejects(attempt(),/Failed to fetch/);assert.equal(saved,receipt);
 assert.equal(await attempt(),receipt);assert.equal(publishes,1);assert.equal(attachments,2);
});
test('unconfirmed submit cannot attach or invent a receipt',async()=>{
 let attachments=0,saved=null;
 await assert.rejects(completeMcpPublication({submit:async()=>{throw new Error('offline');},attach:async()=>attachments++,onReceipt:value=>saved=value}),/offline/);
 assert.equal(saved,null);assert.equal(attachments,0);
});
test('review submission is distinct from a published video',async()=>{
 let attachments=0,saved=null;const receipt={status:'pending_review'};
 assert.equal(await completeMcpPublication({submit:async()=>receipt,attach:async()=>attachments++,onReceipt:value=>saved=value}),receipt);
 assert.equal(saved,receipt);assert.equal(attachments,0);
});
test('authentication fences are not disguised as transient upload errors',()=>{
 const error=Object.assign(new Error('Account changed'),{code:'account_changed'});
 assert.equal(mcpRecoveryError(error,{published:true}),error);assert.equal(isMcpTransientError(error),false);
 const upload=mcpRecoveryError(new TypeError('Failed to fetch'),{published:true});assert.match(upload.message,/game is published/);assert.match(upload.message,/will not be published again/);assert.match(upload.message,/Check your connection/);
});
test('confirmed game state outranks stale publisher queue labels',()=>{
 assert.equal(mcpPublicationLabel({status:'requested'},{state:'published',hasVideo:true}),'Publication confirmed.');
 assert.match(mcpPublicationLabel({status:'publishing'},{state:'published',hasVideo:false}),/Video preview not attached/);
 assert.match(mcpPublicationLabel({status:'requested'},{state:'pending_review'}),/Waiting for review/);
 assert.equal(mcpPublicationLabel({status:'failed'},{state:'private'}),'');
});

test('Connect recovery points at published target and never staged update success',async()=>{
 const{mcpDraftPublicationView}=await import('../src/lib/mcp-publication-recovery.js');
 const draft={game_id:'new-draft',digest:'same-source',publication:{status:'requested'}};
 const live={game_id:'permanent-game',state:'published',digest:'same-source'};
 const target={id:'permanent-game',releaseKey:'current-release',hasVideo:false};
 const states={'new-draft':'draft',previews:{'permanent-game':target}};
 const card=mcpDraftPublicationView(draft,states,live);
 assert.equal(card.locked,true);assert.equal(card.state,'published');assert.equal(card.published,target);
 assert.match(card.label,/Video preview not attached/);assert.doesNotMatch(card.label,/queued/);
 const staged=mcpDraftPublicationView(draft,states,{...live,state:'updating'});
 assert.equal(staged.applied,false);assert.equal(staged.locked,false);assert.equal(staged.update.game_id,live.game_id);assert.equal(staged.published,null);
 const pending=mcpDraftPublicationView(draft,states,{...live,state:'pending_review'});
 assert.equal(pending.locked,true);assert.equal(pending.state,'pending_review');assert.match(pending.label,/Waiting for review/);
});
