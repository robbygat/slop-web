// Narrow, operator-run restoration of the official June desktop games.
// Defaults to a local plan. No owner token is minted; existing Postgres/admin
// finalizers retain submission, review, storage and release-history authority.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundleIdentity} from '../src/lib/bundle-contracts.js';

const root = '/tmp/slop-web-redesign';
// Keep the already published first batch immutable. The separately authorized
// additional originals have their own source, media, plan and operation leases.
const additional = process.argv.includes('--additional');
const batch = additional ? '-additional' : '';
const bundleRoot = `${root}/restored-desktop${batch}`;
const mediaRoot = `${root}/desktop-recordings${batch}`;
const planPath = `${root}/private/desktop${batch}-curation-plan.json`;
const owner = 'b455c43a-5398-45d6-b54d-31d603f53d1f';
const reviewer = '18a58158-24c9-497f-ad8b-e4606cd2210d';
const allowed = additional
  ? ['dungeon-panic-desktop','slopcraft-desktop','umbral-red-desktop']
  : ['run-infinite-desktop','slopkart-desktop','sloppy-zombies-desktop'];
const mode = process.argv[2] || 'plan';
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => quote(JSON.stringify(value)) + '::jsonb';
const mime = file => file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.gif') ? 'image/gif' : 'text/plain';
await fs.mkdir(`${root}/private`, {recursive:true,mode:0o700});

let plan;
try { plan = JSON.parse(await fs.readFile(planPath)); } catch(error) { if(error.code !== 'ENOENT') throw error; }
if (!plan) {
  if (mode !== 'plan') throw Error('Review a plan before applying it.');
  const source = JSON.parse(await fs.readFile(`${bundleRoot}/manifest.json`));
  const media = JSON.parse(await fs.readFile(`${mediaRoot}/media-receipts.json`));
  plan = [];
  for (const game of source) {
    if (!allowed.includes(game.id) || game.source_commit !== '0c7aef1') throw Error('Unexpected restoration source');
    const sourceFiles = Object.fromEntries(await Promise.all(Object.keys(game.files).map(async file => [file, await fs.readFile(`${bundleRoot}/${game.id}/${file}`, 'utf8')])));
    const id = randomUUID(), build = (await bundleIdentity(sourceFiles)).buildId;
    const coverHash = hash(await fs.readFile(`${mediaRoot}/${game.id}/cover.jpg`)).slice(0,32);
    const previewHash = hash(await fs.readFile(`${mediaRoot}/${game.id}/preview.gif`)).slice(0,32);
    const cover = `1.0.0/covers/${id}/${build}-c3-${coverHash}/cover.jpg`;
    const preview = `1.0.0/previews/${id}/${build}-c3-${previewHash}/preview.gif`;
    const files = Object.keys(game.files).map(file => ({path:'1.0.0/'+file,source:`${bundleRoot}/${game.id}/${file}`}));
    files.push({path:cover,source:`${mediaRoot}/${game.id}/cover.jpg`}, {path:preview,source:`${mediaRoot}/${game.id}/preview.gif`});
    for (const file of files) { const data=await fs.readFile(file.source); Object.assign(file,{bytes:data.length,sha256:hash(data),content_type:mime(file.path)}); }
    const manifest = files.map(({source,...receipt}) => receipt).sort((a,b) => Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
    const digest = hash(manifest.map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'));
    plan.push({slug:game.id,id,owner,reviewer,name:game.name,description:game.description,source_commit:game.source_commit,
      source_game_sha256:game.source_game_sha256,runtime_sha256:game.runtime_sha256,build,cover,preview,files,manifest,digest,
      media:media.find(item=>item.slug===game.id),release_root:`releases/${randomBytes(32).toString('hex')}/${game.id}`});
  }
  await fs.writeFile(planPath,JSON.stringify(plan,null,2),{mode:0o600});
}
if(plan.length!==3 || new Set(plan.map(game=>game.slug)).size!==3 || plan.some(game=>!allowed.includes(game.slug)||game.owner!==owner||game.reviewer!==reviewer||game.source_commit!=='0c7aef1')) throw Error('Plan exceeds this exact authorized three-game batch');
for(const game of plan) for(const file of game.files) {
 const data=await fs.readFile(file.source);
 if(data.length!==file.bytes || hash(data)!==file.sha256)throw Error(`Reviewed source changed: ${game.slug}/${file.path}`);
}

// Stable local operation IDs let a failed operator run resume only its own
// existing lease. They are not user credentials or fabricated owner tokens.
let planUpdated = false;
for (const game of plan) {
 if (!game.operation_id) { game.operation_id = randomUUID(); planUpdated = true; }
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(game.operation_id)) throw Error('Invalid curator operation');
 for (const file of game.files) {
  const type = mime(file.path);
  if (file.content_type !== type) { file.content_type = type; game.manifest.find(item => item.path === file.path).content_type = type; planUpdated = true; }
 }
}
if (planUpdated) await fs.writeFile(planPath, JSON.stringify(plan,null,2), {mode:0o600});

function query(label, body) {
  const file=`${root}/private/desktop${batch}-${label}.sql`;
  execFileSync('mkdir',['-p',path.dirname(file)]);
  execFileSync('python3',['-c','import sys,pathlib; p=pathlib.Path(sys.argv[1]); p.write_text(sys.stdin.read()); p.chmod(0o600)',file],{input:body});
  const output=execFileSync('supabase',['db','query','--linked','--project-ref','yqlolbebqfsodqgjlbeh','--file',file],{cwd:'/Users/rob/Documents/slop-mobile',maxBuffer:12*1024*1024}).toString();
  return JSON.parse(output).rows;
}
const identityGuard = `if session_user not in ('postgres','supabase_admin') then raise exception 'curator_session_required'; end if;
 if not exists(select 1 from public.profiles where id='${owner}' and username='slop.game')
 or not public.is_nonanonymous_user('${owner}') or public.has_account_delete_intent('${owner}')
 or not exists(select 1 from public.admin_users a join public.profiles p on p.id=a.user_id where a.user_id='${reviewer}' and p.username='rob')
 or not public.is_nonanonymous_user('${reviewer}') or public.has_account_delete_intent('${reviewer}') then raise exception 'official_identity_changed'; end if;`;

if(mode==='canonicalize-plan') {
 query('canonical-preflight', `do $curation$ begin ${identityGuard}
  if exists(select 1 from storage.objects where bucket_id in ('games','game-drafts') and (split_part(name,'/',1)=any(ARRAY[${allowed.map(quote).join(',')}]) or split_part(name,'/',3)=any(ARRAY[${allowed.map(quote).join(',')}]))) then raise exception 'uploads_already_exist'; end if;
 end $curation$; select true as clear;`);
 for(const game of plan) {
  const sourceFiles=Object.fromEntries(await Promise.all(game.files.filter(file=>file.path!==game.cover&&file.path!==game.preview).map(async file=>[file.path.slice(6),await fs.readFile(file.source,'utf8')])));
  game.build=(await bundleIdentity(sourceFiles)).buildId;
  for(const kind of ['cover','preview']) {
   const file=game.files.find(file=>file.path===game[kind]);
   file.path=`1.0.0/${kind==='cover'?'covers':'previews'}/${game.id}/${game.build}-c3-${file.sha256.slice(0,32)}/${kind==='cover'?'cover.jpg':'preview.gif'}`;
   game[kind]=file.path;
  }
  game.manifest=game.files.map(({source,...receipt})=>receipt).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
  game.digest=hash(game.manifest.map(file=>`${file.path}:${file.bytes}:${file.sha256}`).join('\n'));
 }
 await fs.writeFile(planPath,JSON.stringify(plan,null,2),{mode:0o600});
 console.log(JSON.stringify({mode,games:plan.map(({slug,build,digest})=>({slug,build,digest}))}));
} else if (['prepare-leases','rehearse-leases'].includes(mode)) {
 const statements = plan.map(game => `
  if not exists(select 1 from public.games where id='${game.id}' and slug=${quote(game.slug)} and owner_id='${owner}' and status='draft' and supported_platforms=ARRAY['desktop']) then raise exception 'reviewed_draft_changed'; end if;
  if not exists(select 1 from public.game_bundle_operation_leases where resource=${quote('game:'+game.slug)} and operation_id='${game.operation_id}' and issued_to='${reviewer}' and expires_at>clock_timestamp()) then
   if not public.claim_game_bundle_operation(${quote('game:'+game.slug)},'${game.operation_id}','${reviewer}') then raise exception 'another_game_bundle_operation_is_running'; end if;
  end if;
  if not public.bind_game_bundle_operation_target(${quote('game:'+game.slug)},'${game.operation_id}','${reviewer}','games',${quote(game.release_root)}) then raise exception 'curator_target_journal_required'; end if;`);
 const result=query(mode,`begin; do $curation$ begin ${identityGuard} ${statements.join('\n')} end $curation$;
 select jsonb_agg(jsonb_build_object('resource',resource,'issued_to',issued_to,'target_bucket',target_bucket,'target_root',target_root,'target_state',target_state)) as leases from public.game_bundle_operation_leases where resource=any(ARRAY[${allowed.map(slug=>quote('game:'+slug)).join(',')}]);
 ${mode==='rehearse-leases'?'rollback':'commit'};`);
 console.log(JSON.stringify({mode,result}));
} else if (['create-drafts','rehearse-drafts'].includes(mode)) {
 const statements=[];
 for(const game of plan) {
  const html=await fs.readFile(`${bundleRoot}/${game.slug}/index.html`,'utf8');
  statements.push(`if exists(select 1 from public.games where slug=${quote(game.slug)}) or public.is_game_slug_retired(${quote(game.slug)}) then raise exception 'original_slug_unavailable'; end if;
   insert into public.games(id,slug,owner_id,name,description,html,status,supported_platforms,multiplayer_mode,owns_platform_chrome)
   values('${game.id}',${quote(game.slug)},'${owner}',${quote(game.name)},${quote(game.description)},${quote(html)},'draft',ARRAY['desktop'],null,false);`);
 }
 const result=query(mode,`begin; do $curation$ begin ${identityGuard} ${statements.join('\n')} end $curation$;
 select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'owner_id',owner_id,'status',status,'supported_platforms',supported_platforms)) as drafts from public.games where slug=any(ARRAY[${allowed.map(quote).join(',')}]);
 ${mode==='rehearse-drafts'?'rollback':'commit'};`);
 console.log(JSON.stringify({mode,result}));
} else if (['upload-drafts','upload-releases','verify-public'].includes(mode)) {
 const keys=JSON.parse(await fs.readFile(`${root}/private/import-api-keys.json`));
 const secret=keys.find(key=>key.name==='service_role')?.api_key;
 if(!secret)throw Error('Existing curator service credential unavailable');
 const headers={apikey:secret,Authorization:`Bearer ${secret}`};
 const bucket=mode==='upload-drafts'?'game-drafts':'games';
 for(const game of plan) {
  if(mode!=='verify-public') query(`verify-lease-${game.slug}`,`do $curation$ begin ${identityGuard}
   if not exists(select 1 from public.game_bundle_operation_leases lease join public.games game on game.slug=${quote(game.slug)} where game.id='${game.id}' and game.owner_id='${owner}' and game.status='draft' and lease.resource=${quote('game:'+game.slug)} and lease.operation_id='${game.operation_id}' and lease.issued_to='${reviewer}' and lease.expires_at>clock_timestamp() and lease.target_bucket='games' and lease.target_root=${quote(game.release_root)} and lease.target_state='uploading') then raise exception 'prepare_reviewed_curator_lease_first'; end if;
  end $curation$; select true as authorized;`);
  const prefix=bucket==='game-drafts'?game.slug:game.release_root;
  for(const file of game.files) {
   const url=`https://api.slop.game/storage/v1/object/${bucket}/${prefix}/${file.path}`;
   if(mode!=='verify-public') {
    const prior=await fetch(url,{headers});
    if(prior.ok) { const bytes=Buffer.from(await prior.arrayBuffer()); if(hash(bytes)!==file.sha256)throw Error('Refusing to replace existing object'); }
    else {
     if(prior.status!==400&&prior.status!==404)throw Error(`Storage lookup failed (${prior.status})`);
     const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':file.content_type,'x-upsert':'false','Cache-Control':bucket==='games'?'31536000':'3600'},body:await fs.readFile(file.source)});
     if(!response.ok)throw Error(`Upload failed ${game.slug}/${file.path} (${response.status}): ${await response.text()}`);
    }
   }
   const response=await fetch(mode==='verify-public'?url.replace('/object/','/object/public/'):url,{headers:mode==='verify-public'?{}:headers});
   if(!response.ok)throw Error(`Readback failed (${response.status})`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error(`Stored bytes do not match: ${game.slug}/${file.path}`);
  }
  console.log(JSON.stringify({mode,slug:game.slug,verified_files:game.files.length,digest:game.digest}));
 }
} else if (['rehearse-publish','publish'].includes(mode)) {
 const game=plan.find(game=>game.slug===process.argv[3]);if(!game)throw Error('Choose one exact reviewed original slug');
 const notes=`Curated restoration requested by the Slop owner. Automated service curation authorized by @rob for official @slop.game. June desktop original source robbygat/slop-web@0c7aef1; original game SHA256 ${game.source_game_sha256}. Solo gameplay and input retained; current native Slop.js lifecycle and restart adapter. Authored open-ended games do not fabricate ranked results. Cover and preview are decoded real gameplay captures; all ${game.files.length} immutable release objects were read back and SHA256 verified. Bundle digest ${game.digest}.`;
 const result=query(`${mode}-${game.slug}`,`begin; do $curation$ declare submission uuid; approved boolean; begin
 ${identityGuard}
 if not exists(select 1 from public.games where id='${game.id}' and slug=${quote(game.slug)} and owner_id='${owner}' and status='draft' and supported_platforms=ARRAY['desktop']) then raise exception 'reviewed_draft_changed'; end if;
 if public._game_bundle_manifest_digest(${json(game.manifest)})<>${quote(game.digest)} or not public._validate_game_bundle_manifest('game-drafts',${quote(game.slug)},${json(game.manifest)}) or not public._validate_game_bundle_manifest('games',${quote(game.release_root)},${json(game.manifest)}) then raise exception 'verified_storage_manifest_required'; end if;
 if ${game.media.coverBytes} not between 1 and 716800 or ${game.media.previewBytes} not between 1 and 2097152 or ${game.media.frames} not between 3 and 40 then raise exception 'decoded_media_receipt_invalid'; end if;
 perform set_config('slop.media_write_slug',${quote(game.slug)},true);
 update public.games set thumb=${quote(game.slug+'/'+game.cover)},preview_url=${quote(game.slug+'/'+game.preview)},preview_build_id=${quote(game.build)},preview_status='ready',preview_width=640,preview_height=360,preview_frame_count=${game.media.frames},preview_bytes=${game.media.previewBytes},preview_error=null,preview_attempt_build_id=${quote(game.build)},preview_attempted_at=now(),preview_updated_at=now() where id='${game.id}' and owner_id='${owner}' and status='draft';
 submission := (public.finalize_game_bundle_submission(${quote(game.slug)},${json(game.manifest)},${quote(game.digest)},'${owner}')->>'review_submission_id')::uuid;
 approved := public.finalize_game_bundle_release(${quote(game.slug)},submission,${quote(game.release_root)},${json(game.manifest)},${quote(game.digest)},${quote(notes)},'${reviewer}');
 if not coalesce(approved,false) then raise exception 'existing_review_finalizer_declined'; end if;
 if not public.commit_game_bundle_operation_target(${quote('game:'+game.slug)},'${game.operation_id}','${reviewer}','games',${quote(game.release_root)}) then raise exception 'curator_target_commit_required'; end if;
 if not public.release_game_bundle_operation(${quote('game:'+game.slug)},'${game.operation_id}','${reviewer}') then raise exception 'curator_lease_release_required'; end if;
 end $curation$;
 select jsonb_build_object('id',id,'slug',slug,'owner_id',owner_id,'status',status,'bundle_digest',bundle_digest,'published_bundle_path',published_bundle_path,'release_id',release_id,'supported_platforms',supported_platforms,'preview_width',preview_width,'preview_height',preview_height) as restored from public.games where id='${game.id}';
 ${mode==='rehearse-publish'?'rollback':'commit'};`);
 console.log(JSON.stringify({mode,result}));
} else if(mode==='plan') {
 console.log(JSON.stringify(plan.map(({slug,id,owner,reviewer,release_root,digest,media})=>({slug,id,owner,reviewer,release_root,digest,media})),null,2));
} else throw Error('Unknown curation phase');
