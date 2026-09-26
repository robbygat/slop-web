import {UUID,DIGEST} from './contracts.js';
import {sha256} from './bundle-contracts.js';
export async function mcpPublicationReceipt(row,preview){
 if(!row||row.id!==preview.game_id||row.slug!==preview.slug||row.owner_id!==preview.owner_id)return null;
 const identity={owner_id:row.owner_id,game_id:row.id,slug:row.slug,status:row.status};
 if(row.status==='pending_review')return UUID.test(row.review_submission_id)?{...identity,review_submission_id:row.review_submission_id}:null;
 // The native release finalizer clears the queue nonce. Its protected immutable
 // release and exact manifest are the durable success receipt after approval.
 if(row.status!=='published'||!new RegExp(`^releases/[a-f0-9]{64}/${preview.slug}$`).test(row.published_bundle_path||'')||!DIGEST.test(row.bundle_digest)||!Array.isArray(row.bundle_manifest)||row.bundle_manifest.length<3||row.bundle_manifest.length>512)return null;
 const manifest=[...row.bundle_manifest],seen=new Set();
 for(const file of manifest){if(!file||typeof file.path!=='string'||!/^1\.0\.0\/[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(file.path)||file.path.includes('..')||seen.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>50*1024*1024||!DIGEST.test(file.sha256))return null;seen.add(file.path);}
 manifest.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const digest=files=>sha256(files.map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'));
 if(await digest(manifest)!==row.bundle_digest)return null;
 const source=manifest.filter(file=>!/^1\.0\.0\/(covers|previews)\//.test(file.path));
 if(!source.some(file=>file.path==='1.0.0/index.html')||await digest(source)!==preview.digest)return null;
 return {...identity,review_submission_id:null,release_root:row.published_bundle_path,digest:row.bundle_digest};
}
// How the MCP inbox treats a game row. A draft that still carries a release,
// or the cover and clip a publish uploaded (withdrawing a live game to update
// it clears the release pointer but keeps both), is a live game mid-update:
// the next revision must update it, never publish a duplicate beside it.
// A fresh MCP draft is only a placeholder row with neither.
export function mcpInboxState(row){
 if(row?.status!=='draft')return row?.status;
 return row.published_bundle_path||(row.thumb&&row.preview_url)?'updating':'draft';
}
