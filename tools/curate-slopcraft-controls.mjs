// One authorized repair of the already-published official Slopcraft game.
// Called via curate-desktop-originals.mjs --slopcraft-controls. Public objects
// are never overwritten and the existing game is never recreated.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundleIdentity} from '../src/lib/bundle-contracts.js';
const root='/tmp/slop-web-redesign',sourceRoot=root+'/slopcraft-controls-update',privateRoot=root+'/private';
const slug='slopcraft-desktop',id='67b96c1b-df5a-431e-9fcc-ac5db1239bbe',owner='b455c43a-5398-45d6-b54d-31d603f53d1f',reviewer='18a58158-24c9-497f-ad8b-e4606cd2210d';
const priorRoot='releases/85916f9d9b3f4c1cc46428de52a703ba6f9987dce543b7e2a11d768817ffa4d6/'+slug;
const priorDigest='1bfe583182ba4b1239bb6d535888af1fa102a3b310d24a69ad972a68d30a21dc';
const expectedScript='c2c95a77c5e7a46a9864dc2c670c19c89f054bd28d984157df3bd6e0056e45f8';
const planPath=privateRoot+'/slopcraft-controls-curation-plan.json',mode=process.argv[2]||'plan';
const hash=x=>createHash('sha256').update(x).digest('hex'),q=x=>"'"+String(x).replaceAll("'","''")+"'",j=x=>q(JSON.stringify(x))+'::jsonb';
const mime=p=>p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.gif')?'image/gif':'text/plain';
await fs.mkdir(privateRoot,{recursive:true,mode:0o700});
function query(label,sql){const file=privateRoot+'/slopcraft-controls-'+label+'.sql';execFileSync('python3',['-c','import pathlib,sys;p=pathlib.Path(sys.argv[1]);p.write_text(sys.stdin.read());p.chmod(0o600)',file],{input:sql});return JSON.parse(execFileSync('supabase',['db','query','--linked','--project-ref','yqlolbebqfsodqgjlbeh','--file',file],{cwd:'/Users/rob/Documents/slop-mobile',maxBuffer:4e6}).toString()).rows;}
const identity=`if session_user not in ('postgres','supabase_admin') then raise exception 'curator_session_required';end if;
 if not exists(select 1 from public.profiles where id='${owner}' and username='slop.game') or not public.is_nonanonymous_user('${owner}') or public.has_account_delete_intent('${owner}')
 or not exists(select 1 from public.admin_users a join public.profiles p on p.id=a.user_id where a.user_id='${reviewer}' and p.username='rob') or not public.is_nonanonymous_user('${reviewer}') or public.has_account_delete_intent('${reviewer}') then raise exception 'official_identity_changed';end if;`;
const unchanged=`if not exists(select 1 from public.games where id='${id}' and slug='${slug}' and owner_id='${owner}' and status='published' and published_bundle_path='${priorRoot}' and bundle_digest='${priorDigest}' and supported_platforms=ARRAY['desktop'] and not coalesce(media_delete_authorized,false)) then raise exception 'reviewed_public_release_changed';end if;`;
let plan;try{plan=JSON.parse(await fs.readFile(planPath));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!plan){
 if(mode!=='plan')throw Error('Review the exact update plan first');
 const source=JSON.parse(await fs.readFile(sourceRoot+'/manifest.json'));if(source.length!==1||source[0].id!==slug||source[0].source_commit!=='0c7aef1'||source[0].files['game.js'].sha256!==expectedScript)throw Error('Unexpected reviewed source');
 const prior=query('inspect',`do $c$ begin ${identity}${unchanged} end $c$;select bundle_manifest,release_id from public.games where id='${id}';`)[0];
 const files=[];const content={};
 for(const [name,receipt]of Object.entries(source[0].files)){
  const location=sourceRoot+'/'+slug+'/'+name,data=await fs.readFile(location),previous=prior.bundle_manifest.find(x=>x.path==='1.0.0/'+name);
  if(data.length!==receipt.bytes||hash(data)!==receipt.sha256||!previous)throw Error('Reviewed source receipt changed');
  const old=await fetch('https://api.slop.game/storage/v1/object/public/games/'+priorRoot+'/1.0.0/'+name);if(!old.ok)throw Error('Prior release unavailable');
  const oldBytes=Buffer.from(await old.arrayBuffer());if(hash(oldBytes)!==previous.sha256||oldBytes.length!==previous.bytes)throw Error('Prior public bytes changed');
  if(name!=='game.js'&&hash(data)!==previous.sha256)throw Error('Only the reviewed control script may change');
  files.push({path:'1.0.0/'+name,source:location,bytes:data.length,sha256:hash(data),content_type:mime(name),prior_sha256:previous.sha256});content[name]=data.toString();
 }
 const build=(await bundleIdentity(content)).buildId;
 const media=JSON.parse(await fs.readFile(root+'/desktop-recordings-additional/media-receipts.json')).find(x=>x.slug===slug);
 for(const kind of ['cover','preview']){
  const name=kind==='cover'?'cover.jpg':'preview.gif',location=root+'/desktop-recordings-additional/'+slug+'/'+name,data=await fs.readFile(location);
  const relative=`1.0.0/${kind==='cover'?'covers':'previews'}/${id}/${build}-c3-${hash(data).slice(0,32)}/${name}`;
  files.push({path:relative,source:location,bytes:data.length,sha256:hash(data),content_type:mime(name)});
 }
 const manifest=files.map(({source,prior_sha256,...f})=>f).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
 plan={slug,id,owner,reviewer,prior_root:priorRoot,prior_digest:priorDigest,prior_release_id:prior.release_id,source_commit:'0c7aef1',source_game_sha256:source[0].source_game_sha256,runtime_sha256:source[0].runtime_sha256,build,files,manifest,media,cover:files.at(-2).path,preview:files.at(-1).path,digest:hash(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n')),release_root:'releases/'+randomBytes(32).toString('hex')+'/'+slug,operation_id:randomUUID()};
 await fs.writeFile(planPath,JSON.stringify(plan,null,2),{mode:0o600});
}
// The manifest validator binds the complete mutable draft prefix. Preserve
// the two older reviewed media objects instead of deleting history to shrink it.
if(mode==='plan'&&plan.files.length===8){
 const previous=JSON.parse(await fs.readFile(privateRoot+'/desktop-additional-curation-plan.json')).find(item=>item.slug===slug);
 if(previous?.id!==id||previous.release_root!==priorRoot||previous.digest!==priorDigest)throw Error('Prior curated receipt changed');
 for(const relative of [previous.cover,previous.preview]){
  const file=previous.files.find(item=>item.path===relative);if(!file)throw Error('Prior media receipt missing');
  const data=await fs.readFile(file.source);if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Prior media bytes changed');
  plan.files.push({...file});
 }
 plan.manifest=plan.files.map(({source,prior_sha256,...file})=>file).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
 plan.digest=hash(plan.manifest.map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'));
 await fs.writeFile(planPath,JSON.stringify(plan,null,2),{mode:0o600});
}
if(plan.slug!==slug||plan.id!==id||plan.owner!==owner||plan.reviewer!==reviewer||plan.prior_root!==priorRoot||plan.prior_digest!==priorDigest||plan.files.length!==10||!/^releases\/[0-9a-f]{64}\/slopcraft-desktop$/.test(plan.release_root)||plan.release_root===priorRoot||!/^[0-9a-f-]{36}$/.test(plan.operation_id))throw Error('Plan exceeds this exact authorized repair');
for(const file of plan.files){const data=await fs.readFile(file.source);if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Reviewed file changed: '+file.path);}
const checkedManifest=plan.files.map(({source,prior_sha256,...file})=>file).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
if(JSON.stringify(checkedManifest)!==JSON.stringify(plan.manifest)||new Set(plan.files.map(f=>f.path)).size!==10||plan.media.slug!==slug||plan.media.frames<3||plan.media.frames>40||plan.media.coverBytes!==plan.files.find(f=>f.path===plan.cover)?.bytes||plan.media.previewBytes!==plan.files.find(f=>f.path===plan.preview)?.bytes||plan.media.coverBytes>716800||plan.media.previewBytes>2097152)throw Error('Reviewed media or manifest mismatch');
if(plan.files.find(f=>f.path==='1.0.0/game.js')?.sha256!==expectedScript||plan.digest!==hash(plan.manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n')))throw Error('Reviewed manifest changed');
const lease=`if not exists(select 1 from public.game_bundle_operation_leases where resource='game:${slug}' and operation_id='${plan.operation_id}' and issued_to='${reviewer}' and expires_at>clock_timestamp() and target_bucket='games' and target_root='${plan.release_root}' and target_state='uploading') then raise exception 'reviewed_curator_lease_required';end if;`;
if(mode==='plan')console.log(JSON.stringify({slug,id,prior_root:priorRoot,release_root:plan.release_root,digest:plan.digest,changed_script:expectedScript,objects:plan.files.length},null,2));
else if(['prepare-leases','rehearse-leases'].includes(mode)){
 console.log(JSON.stringify(query(mode,`begin;do $c$ begin ${identity}${unchanged}
 if not exists(select 1 from public.game_bundle_operation_leases where resource='game:${slug}' and operation_id='${plan.operation_id}' and issued_to='${reviewer}' and expires_at>clock_timestamp()) then if not public.claim_game_bundle_operation('game:${slug}','${plan.operation_id}','${reviewer}') then raise exception 'another_operation_running';end if;end if;
 if not public.bind_game_bundle_operation_target('game:${slug}','${plan.operation_id}','${reviewer}','games','${plan.release_root}') then raise exception 'target_journal_required';end if;end $c$;select true as leased;${mode==='rehearse-leases'?'rollback':'commit'};`)));
}else if(['upload-drafts','upload-releases','verify-public'].includes(mode)){
 const bucket=mode==='upload-drafts'?'game-drafts':'games',prefix=bucket==='games'?plan.release_root:slug;
 let headers={};if(mode!=='verify-public'){query('upload-guard',`do $c$ begin ${identity}${unchanged}${lease}end $c$;select true as authorized;`);const keys=JSON.parse(await fs.readFile(privateRoot+'/import-api-keys.json')),key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Existing curator service credential unavailable');headers={apikey:key,Authorization:'Bearer '+key};}
 for(const file of plan.files){
  const storage='https://api.slop.game/storage/v1/object/'+bucket+'/'+prefix+'/'+file.path;
  if(mode!=='verify-public'){
   const current=await fetch(storage+'?verify='+randomBytes(8).toString('hex'),{headers,cache:'no-store',signal:AbortSignal.timeout(25000)});let overwrite=false,write=!current.ok;
   if(current.ok){const bytes=Buffer.from(await current.arrayBuffer());if(hash(bytes)!==file.sha256){if(bucket!=='game-drafts'||file.path!=='1.0.0/game.js'||hash(bytes)!==file.prior_sha256)throw Error('Refusing to replace unexpected stored bytes');overwrite=true;write=true;}}
   else if(![400,404].includes(current.status))throw Error('Storage preflight failed '+current.status);
   if(write){const r=await fetch(storage,{method:'POST',headers:{...headers,'Content-Type':file.content_type,'x-upsert':String(overwrite),'Cache-Control':bucket==='games'?'31536000':'0'},body:await fs.readFile(file.source)});if(!r.ok)throw Error('Upload failed '+r.status+' '+await r.text());}
  }
  const response=await fetch((mode==='verify-public'?storage.replace('/object/','/object/public/'):storage)+'?verify='+randomBytes(8).toString('hex'),{headers,cache:'no-store',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Readback failed '+response.status);const data=Buffer.from(await response.arrayBuffer());if(data.length!==file.bytes||hash(data)!==file.sha256)throw Error('Readback mismatch '+file.path);
 }
 console.log(JSON.stringify({mode,slug,verified_objects:plan.files.length,digest:plan.digest}));
}else if(['rehearse-publish','publish'].includes(mode)){
 const notes=`Official Slopcraft control repair explicitly requested by the Slop owner. Curated by service operator with verified admin @rob for @slop.game. Original June source robbygat/slop-web@0c7aef1. Only game.js changed (SHA256 ${expectedScript}); same SDK, HTML, fonts, physics, world and unscored gameplay. Native pointer lock stays a user gesture; unavailable lock uses captured drag, one aiming reticle, safe pause/cancel and no stale lock resume. Ten objects, including two preserved prior-media references, independently read back and hashed; actual browser drag, mining and Escape checked. Previous immutable release ${priorRoot}. New digest ${plan.digest}.`;
 const result=query(mode,`begin;do $c$ declare submission uuid;before_count bigint; begin ${identity}
 perform pg_advisory_xact_lock(hashtextextended('slop-game:${slug}',0));${unchanged}${lease}
 if public._game_bundle_manifest_digest(${j(plan.manifest)})<>${q(plan.digest)} or not public._validate_game_bundle_manifest('game-drafts','${slug}',${j(plan.manifest)}) or not public._validate_game_bundle_manifest('games','${plan.release_root}',${j(plan.manifest)}) then raise exception 'verified_manifests_required';end if;
 select count(*) into before_count from public.games;
 if not public.finalize_game_bundle_withdrawal_staged('${slug}','draft',${j(plan.manifest)},'${plan.digest}','${reviewer}') then raise exception 'verified_staging_failed';end if;
 perform set_config('slop.media_write_slug','${slug}',true);
 update public.games set thumb='${slug}/${plan.cover}',preview_url='${slug}/${plan.preview}',preview_build_id='${plan.build}',preview_status='ready',preview_width=640,preview_height=360,preview_frame_count=${plan.media.frames},preview_bytes=${plan.media.previewBytes},preview_error=null,preview_attempt_build_id='${plan.build}',preview_attempted_at=now(),preview_updated_at=now() where id='${id}' and owner_id='${owner}' and status='draft';
 submission := (public.finalize_game_bundle_submission('${slug}',${j(plan.manifest)},'${plan.digest}','${owner}')->>'review_submission_id')::uuid;
 if not coalesce(public.finalize_game_bundle_release('${slug}',submission,'${plan.release_root}',${j(plan.manifest)},'${plan.digest}',${q(notes)},'${reviewer}'),false) then raise exception 'verified_release_failed';end if;
 if not public.commit_game_bundle_operation_target('game:${slug}','${plan.operation_id}','${reviewer}','games','${plan.release_root}') or not public.release_game_bundle_operation('game:${slug}','${plan.operation_id}','${reviewer}') then raise exception 'curator_lease_commit_failed';end if;
 if (select count(*) from public.games)<>before_count or not exists(select 1 from public.games where id='${id}' and owner_id='${owner}' and status='published' and published_bundle_path='${plan.release_root}' and bundle_digest='${plan.digest}' and supported_platforms=ARRAY['desktop']) then raise exception 'catalog_identity_changed';end if;
 if not exists(select 1 from public.game_release_history where game_slug='${slug}' and release_path='${priorRoot}' and not is_current) or not exists(select 1 from public.game_release_history where game_slug='${slug}' and release_path='${plan.release_root}' and is_current) then raise exception 'release_history_missing';end if;
 end $c$;select jsonb_build_object('id',id,'slug',slug,'owner_id',owner_id,'status',status,'published_bundle_path',published_bundle_path,'bundle_digest',bundle_digest,'release_id',release_id,'supported_platforms',supported_platforms) as updated from public.games where id='${id}';${mode==='rehearse-publish'?'rollback':'commit'};`);
 await fs.writeFile(privateRoot+'/slopcraft-controls-'+mode+'-receipt.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({mode,result}));
}else throw Error('Unknown bounded control-update phase');
