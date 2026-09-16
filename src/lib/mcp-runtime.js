// Matches the unchanged creator-v1.js shipped in slop-mobile and the MCP package.
export const MCP_RUNTIME_SHA256='cf80d35f8be857d6e092460b362aaf0bd7238f34085d20c15ae376e994922d2f';
export const MCP_RUNTIME_ERROR='Ask your coding app to call slop_game_template, keep its slop.js unchanged, and send a new revision that loads it before your game code.';
export function mcpRuntimeProblem(manifest,html){
 const runtime=manifest?.find(file=>file.path==='1.0.0/slop.js');
 if(runtime?.sha256!==MCP_RUNTIME_SHA256||runtime.bytes!==9612||typeof html!=='string')return MCP_RUNTIME_ERROR;
 const source=html.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<template\b[\s\S]*?<\/template\s*>/gi,'');
 let meta=false,script=false;
 for(const match of source.matchAll(/<(meta|script)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const attributes=new Map();
  for(const attr of match[2].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   const key=attr[1].toLowerCase();if(!attributes.has(key))attributes.set(key,attr[2]??attr[3]??attr[4]);
  }
  if(match[1].toLowerCase()==='meta'&&attributes.get('name')?.toLowerCase()==='slop-runtime'&&attributes.get('content')==='creator-v1')meta=true;
  if(match[1].toLowerCase()==='script'&&['slop.js','./slop.js'].includes(attributes.get('src'))&&['','module','text/javascript','application/javascript'].includes(attributes.get('type')||''))script=true;
 }
 return meta&&script?null:MCP_RUNTIME_ERROR;
}
