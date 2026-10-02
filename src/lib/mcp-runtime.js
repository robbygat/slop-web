// Matches the unchanged creator-v1.js shipped in slop-mobile and the MCP package.
import {mcpRuntimeProblem as sharedRuntimeProblem,MCP_RUNTIME_SHA256,MCP_PERSISTENT_RUNTIME_SHA256,MCP_PERSISTENT_RUNTIME_BYTES,MCP_RUNTIME_ERROR} from '../../mcp/runtime-policy.mjs';
export {MCP_RUNTIME_SHA256,MCP_PERSISTENT_RUNTIME_SHA256,MCP_RUNTIME_ERROR};
export function mcpRuntimeProblem(manifest,html,{persistent=false}={}){
 if(persistent&&sharedRuntimeProblem(manifest,html,true)!==null)return MCP_RUNTIME_ERROR;
 const runtime=manifest?.find(file=>file.path==='1.0.0/slop.js');
 const marker=persistent?'persistent-v1':'creator-v1';
 if(runtime?.sha256!==(persistent?MCP_PERSISTENT_RUNTIME_SHA256:MCP_RUNTIME_SHA256)||runtime.bytes!==(persistent?MCP_PERSISTENT_RUNTIME_BYTES:9612)||typeof html!=='string')return MCP_RUNTIME_ERROR;
 const source=html.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<template\b[\s\S]*?<\/template\s*>/gi,'');
 let meta=0,script=false;
 for(const match of source.matchAll(/<(meta|script)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const attributes=new Map();
  for(const attr of match[2].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   const key=attr[1].toLowerCase();if(!attributes.has(key))attributes.set(key,attr[2]??attr[3]??attr[4]);
  }
  if(match[1].toLowerCase()==='meta'&&attributes.get('name')?.toLowerCase()==='slop-runtime'){
   if(attributes.get('content')!==marker)return MCP_RUNTIME_ERROR;meta++;
  }
  if(match[1].toLowerCase()==='script'&&['slop.js','./slop.js'].includes(attributes.get('src'))&&['','module','text/javascript','application/javascript'].includes(attributes.get('type')||''))script=true;
 }
 return meta===1&&script?null:MCP_RUNTIME_ERROR;
}
