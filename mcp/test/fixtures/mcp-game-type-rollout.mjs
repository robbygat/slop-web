import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const source=readFileSync(new URL('../../../supabase/migrations/20261019124000_mcp_game_type_contract.sql',import.meta.url),'utf8');
export const mcpGameTypeMigrationSha=createHash('sha256').update(source).digest('hex');
const md5=createHash('md5').update(source).digest('hex');
const body=source.replace(/\nbegin;\r?\n/,'\n').replace(/\r?\ncommit;\s*$/,'');
if(source.includes('$frozen_mcp_game_type$'))throw Error('Unsafe source delimiter');
const expected=`('public.mcp_service(text,jsonb)','b7305d4d619f24414ff3e7a35eea917f'),
('public._mcp_agent_publish(text,jsonb,public.mcp_connections)','0f5114fc0844e02a91c0a1c8c9570edd'),
('public._mcp_submission_json(public.mcp_submissions)','8f8d3db369cd6ca6372f64c84074e597'),
('public._mcp_source_game_type(jsonb,text,boolean)','f3ee7c1159a835bd1e54ed7277857484'),
('public._mcp_send_game_type(public.mcp_connections,jsonb)','fa5435392b0071429770533b09c0254c'),
('public._mcp_publish_game_type(public.mcp_submissions,jsonb)','50c5808e5219c8120ccf3f0d590f1a7a')`;
const postGuard=`do $mcp_type_postflight$
declare item record;
begin
 for item in select * from(values ${expected}) checked(signature,digest) loop
  if (select md5(replace(prosrc,E'\\r\\n',E'\\n')) from pg_proc where oid=to_regprocedure(item.signature)) is distinct from item.digest then
   raise exception 'mcp_type_postflight_function_drift: %',item.signature;end if;
 end loop;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name in('mcp_projects','mcp_submissions') and column_name='game_type' and data_type='text' and is_nullable='YES')<>2 then
  raise exception 'mcp_type_postflight_columns';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('_mcp_source_game_type','_mcp_send_game_type','_mcp_publish_game_type')
  and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute') or has_function_privilege('service_role',oid,'execute'))) then
  raise exception 'mcp_type_internal_helper_exposed';end if;
 if has_function_privilege('anon','public.mcp_service(text,jsonb)','execute') or has_function_privilege('authenticated','public.mcp_service(text,jsonb)','execute')
  or not has_function_privilege('service_role','public.mcp_service(text,jsonb)','execute') then raise exception 'mcp_type_service_acl_changed';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261019124000' and (name<>'mcp_game_type_contract' or md5(statements[1])<>'${md5}')) then
  raise exception 'mcp_type_history_mismatch';end if;
end;$mcp_type_postflight$;
`;
const summary=`select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'source_md5',md5(replace(p.prosrc,E'\\r\\n',E'\\n')),'acl',p.proacl) order by p.proname)
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('mcp_service','_mcp_agent_publish','_mcp_submission_json','_mcp_source_game_type','_mcp_send_game_type','_mcp_publish_game_type')),
 'columns',(select count(*) from information_schema.columns where table_schema='public' and table_name in('mcp_projects','mcp_submissions') and column_name='game_type'),
 'projects',(select count(*) from public.mcp_projects),'submissions',(select count(*) from public.mcp_submissions),
 'jobs',(select count(*) from public.mcp_publish_jobs),
 'history',(select jsonb_build_object('version',version,'name',name,'source_md5',md5(statements[1])) from supabase_migrations.schema_migrations where version='20261019124000')
) verification;
`;
export function buildMcpGameTypeRollout(mode,sha=mcpGameTypeMigrationSha){
 if(sha!==mcpGameTypeMigrationSha)throw Error('Migration fingerprint mismatch');
 if(mode==='preflight')return `begin read only;set local statement_timeout='30s';\n${summary}commit;\n`;
 if(mode==='postflight')return `begin read only;set local statement_timeout='30s';\n${postGuard}${summary}commit;\n`;
 if(!['apply','rehearsal'].includes(mode))throw Error('apply, rehearsal, preflight or postflight required');
 return `begin;
set local lock_timeout='3s';set local statement_timeout='60s';
do $history_guard$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261019124000') then raise exception 'mcp_type_already_recorded';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019120000' and name='turns_multiplayer') then raise exception 'turns_backend_history_missing';end if;
end;$history_guard$;
${body}
${postGuard}
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20261019124000','mcp_game_type_contract',array[$frozen_mcp_game_type$${source}$frozen_mcp_game_type$]);
notify pgrst,'reload schema';
${mode==='apply'?'commit':'rollback'};
`;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const [mode,output,sha]=process.argv.slice(2);if(!output||!sha)throw Error('Mode, output path and reviewed migration SHA256 required');
 const sql=buildMcpGameTypeRollout(mode,sha);writeFileSync(output,sql);
 console.log(JSON.stringify({migrationSha256:mcpGameTypeMigrationSha,sourceMd5:md5,wrapperSha256:createHash('sha256').update(sql).digest('hex')}));
}
