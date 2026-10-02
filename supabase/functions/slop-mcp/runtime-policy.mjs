// Matches the unchanged creator-v1.js shipped in slop-mobile and the MCP package.
export const MCP_RUNTIME_SHA256='cf80d35f8be857d6e092460b362aaf0bd7238f34085d20c15ae376e994922d2f';
export const MCP_PERSISTENT_RUNTIME_SHA256='621bd0840de3657e21789fe94e2bde8ce97f21d33cf58107779d891171366996';
export const MCP_PERSISTENT_RUNTIME_BYTES=450831;
export const MCP_RUNTIME_ERROR='Ask your coding app to call slop_game_template, keep its slop.js unchanged, and send a new revision that loads it before your game code.';
function persistentBootOrder(html){
 // Classic, synchronous SDK first. Deferred/module/async SDK tags cannot
 // promise availability when the following classic game script executes.
 const tokens=/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[A-Za-z][A-Za-z0-9:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
 let depth=0,sdk=false,marker=false;
 for(const match of html.matchAll(tokens)){
  const tag=match[0];
  if(/^<template\b/i.test(tag)){depth++;continue;}
  if(/^<\/template\b/i.test(tag)){if(depth>0)depth--;continue;}
  if(depth||tag.startsWith('<!--'))continue;
  const opening=/^<(meta|script)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i.exec(tag);
  if(!opening)continue;
  const attrs=new Map();
  for(const attr of opening[2].matchAll(/(?:^|[\t\n\f\r ])([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){
   const key=attr[1].toLowerCase();if(!attrs.has(key))attrs.set(key,attr[2]??attr[3]??attr[4]??'');
  }
  if(opening[1].toLowerCase()==='meta'){
   if(attrs.get('name')?.toLowerCase()==='slop-runtime'&&attrs.get('content')==='persistent-v1')marker=true;
   continue;
  }
  const type=(attrs.get('type')||'').trim().toLowerCase();
  if(type&&!['module','text/javascript','application/javascript'].includes(type))continue;
  if(['slop.js','./slop.js'].includes(attrs.get('src'))){
   if(sdk||type==='module'||attrs.has('async')||attrs.has('defer')||attrs.has('nomodule'))return false;
   sdk=true;
  }else if(!sdk)return false;
 }
 return sdk&&marker&&depth===0;
}
// The boolean comes only from decoded source admission/re-attestation, never
// from the caller's JSON flag or the catalog alone. Arcade remains unchanged.
export function mcpRuntimeProblem(manifest,html,persistent=false){
 const runtime=manifest?.find(file=>file.path==='1.0.0/slop.js');
 const marker=persistent?'persistent-v1':'creator-v1';
 if(runtime?.sha256!==(persistent?MCP_PERSISTENT_RUNTIME_SHA256:MCP_RUNTIME_SHA256)||runtime.bytes!==(persistent?MCP_PERSISTENT_RUNTIME_BYTES:9612)||typeof html!=='string')return MCP_RUNTIME_ERROR;
 const source=html.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<template\b[\s\S]*?<\/template\s*>/gi,'');
 let meta=false,script=false;
 for(const match of source.matchAll(/<(meta|script)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const attributes=new Map();
  for(const attr of match[2].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   const key=attr[1].toLowerCase();if(!attributes.has(key))attributes.set(key,attr[2]??attr[3]??attr[4]);
  }
  if(match[1].toLowerCase()==='meta'&&attributes.get('name')?.toLowerCase()==='slop-runtime'&&attributes.get('content')===marker)meta=true;
  if(match[1].toLowerCase()==='script'&&['slop.js','./slop.js'].includes(attributes.get('src'))&&['','module','text/javascript','application/javascript'].includes(attributes.get('type')||''))script=true;
 }
 return meta&&script&&(!persistent||persistentBootOrder(html))?null:MCP_RUNTIME_ERROR;
}
