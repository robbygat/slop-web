// Pure decoded-byte contract shared by local MCP preflight and the web client.
export const ARCADE_BUDGET=Object.freeze({total:2_000_000,file:512_000,files:64});
export const PERSISTENT_BUDGET=Object.freeze({total:50_000_000,file:8_000_000,files:400,firstLoad:5_000_000});
const TEXT=/\.(?:html|js|css|json|svg|txt)$/;
const BINARY=/\.(?:glb|bin|jpg|webp|ktx2|ogg)$/;
const ARCADE_PATH=/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:html|js|css|json|svg|txt)$/;
const PERSISTENT_PATH=/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:html|js|css|json|svg|txt|glb|bin|jpg|webp|ktx2|ogg)$/;
const fail=message=>{throw new Error(message);};
// A bounded action contract, never a caller-supplied server program. The room
// authority checks every field again when accepting an authenticated turn.
export function multiplayerContract(raw){
 if(raw===undefined||raw===null||raw===false)return null;
 const invalid=()=>fail('invalid_multiplayer_contract');
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='action_schema,max_turns,mode,protocol,seats'||raw.protocol!=='turns-v1'||raw.mode!=='match'||raw.seats!==2||!Number.isSafeInteger(raw.max_turns)||raw.max_turns<1||raw.max_turns>256)invalid();
 const schema=raw.action_schema;
 if(!schema||typeof schema!=='object'||Array.isArray(schema)||Object.keys(schema).length<1||Object.keys(schema).length>8)invalid();
 const normalized={};
 for(const name of Object.keys(schema).sort()){
  if(!/^[a-z][a-z0-9_]{0,31}$/.test(name)||['__proto__','prototype','constructor'].includes(name))invalid();
  const rule=schema[name];if(!rule||typeof rule!=='object'||Array.isArray(rule))invalid();
  if(rule.type==='number'||rule.type==='integer'){
   if(Object.keys(rule).sort().join(',')!=='max,min,type'||!Number.isFinite(rule.min)||!Number.isFinite(rule.max)||rule.min>rule.max||Math.abs(rule.min)>1e6||Math.abs(rule.max)>1e6||rule.type==='integer'&&(!Number.isInteger(rule.min)||!Number.isInteger(rule.max)))invalid();
   normalized[name]={type:rule.type,min:rule.min,max:rule.max};
  }else if(rule.type==='enum'){
   if(Object.keys(rule).sort().join(',')!=='type,values'||!Array.isArray(rule.values)||rule.values.length<1||rule.values.length>16||rule.values.some(value=>typeof value!=='string'||Array.from(value).length<1||Array.from(value).length>32||value.includes('\0'))||new Set(rule.values).size!==rule.values.length)invalid();
   normalized[name]={type:'enum',values:[...rule.values]};
  }else invalid();
 }
 const contract={protocol:'turns-v1',mode:'match',seats:2,max_turns:raw.max_turns,action_schema:normalized};
 // PostgreSQL jsonb uses a space after separators. Count those UTF-8 bytes
 // too so a locally accepted large enum cannot exceed the authority's cap.
 const jsonb=value=>Array.isArray(value)?'['+value.map(jsonb).join(', ')+']':value&&typeof value==='object'?'{'+Object.keys(value).map(key=>JSON.stringify(key)+': '+jsonb(value[key])).join(', ')+'}':JSON.stringify(value);
 if(new TextEncoder().encode(jsonb(contract)).length>4096)invalid();
 return contract;
}
function binaryLength(path,value){
 if(!BINARY.test(path)||!value||Object.keys(value).sort().join(',')!=='data,encoding'||value.encoding!=='base64'||typeof value.data!=='string'||value.data.length>10_666_668||value.data.length%4!==0||/[^A-Za-z0-9+/]/.test(value.data.replace(/={1,2}$/, '')))fail('invalid_binary_file');
 const encoded=value.data,padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
 // Reject nonzero pad bits without a second full-size btoa string. The native
 // decoder is optional; older Edge runtimes use one preallocated byte buffer,
 // never Uint8Array.from(string, callback)'s boxed per-character array.
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 if(padding&&(!encoded.length||(alphabet.indexOf(encoded[encoded.length-padding-1])& (padding===2?15:3))!==0))fail('invalid_binary_file');
 return encoded.length/4*3-padding;
}
export function fileByteLength(path,value){
 if(TEXT.test(path)){if(typeof value!=='string'||value.includes('\0'))fail('invalid_file');return new TextEncoder().encode(value).length;}
 return binaryLength(path,value);
}
export function fileBytes(path,value,buffer=null){
 if(TEXT.test(path)){if(typeof value!=='string'||value.includes('\0'))fail('invalid_file');return new TextEncoder().encode(value);}
 const length=binaryLength(path,value),encoded=value.data;
 try{
  if(buffer!==null){
   if(!(buffer instanceof Uint8Array)||buffer.length<length)throw new Error('invalid_binary_file');
   const bytes=buffer.subarray(0,length);
   if(typeof bytes.setFromBase64==='function')bytes.setFromBase64(encoded);
   else{const raw=atob(encoded);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}
   return bytes;
  }
  if(typeof Uint8Array.fromBase64==='function')return Uint8Array.fromBase64(encoded);
  const raw=atob(encoded),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
 }catch{throw new Error('invalid_binary_file');}
}
// Comments/string contents never grant a persistence capability. Templates are
// stripped as a whole: interpolated dynamic boot programs fail conservative.
function executable(source){return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,match=>' '.repeat(match.length));}
// Read whole attribute values, including valid unquoted HTML, without treating
// data-src or text inside another attribute as a real resource dependency.
function attributes(source){
 const values=new Map();
 for(const match of source.matchAll(/(?:^|[\t\n\f\r ])([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)){
  const name=match[1].toLowerCase();if(!values.has(name))values.set(name,match[2]??match[3]??match[4]);
 }
 return values;
}
function activeHtmlBoot(source){
 // Walk complete tags so nested templates stay inert and markup-looking text
 // in script/style bodies or quoted attributes cannot end a template early.
 const tokens=/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[A-Za-z][A-Za-z0-9:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
 const parts=[];let depth=0,cursor=0;
 for(const match of source.matchAll(tokens)){
  if(depth===0)parts.push(source.slice(cursor,match.index));
  const tag=match[0];
  if(/^<template\b/i.test(tag))depth++;
  else if(/^<\/template\b/i.test(tag)){if(depth>0)depth--;}
  else if(depth===0&&!tag.startsWith('<!--')&&(!match[1]||['script','style'].includes(match[1].toLowerCase())))parts.push(tag);
  cursor=match.index+tag.length;
 }
 if(depth===0)parts.push(source.slice(cursor));
 return parts.join('');
}
function codeOrder(files){
 const html=activeHtmlBoot(typeof files['index.html']==='string'?files['index.html']:''),parts=[];
 for(const script of html.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi)){
  const attrs=attributes(script[1]),type=(attrs.get('type')||'').trim().toLowerCase();
  if(type&&!['module','text/javascript','application/javascript'].includes(type))continue;
  const path=attrs.get('src')?.replace(/^\.\//,'');
  if(path){if(path!=='slop.js'&&typeof files[path]==='string')parts.push(files[path]);}else parts.push(script[2]);
 }
 // Unloaded/lazy helpers cannot attest the entrypoint's persistence contract.
 return executable(parts.join('\n'));
}
function firstLoad(files,spec,byteLengths){
 if(!Array.isArray(spec.first_load)||!spec.first_load.length)fail('first_load_required');
 const included=new Set(['index.html','slop.spec.json']),queue=['index.html'];
 const add=(from,raw)=>{
  if(!raw||raw.startsWith('data:')||raw.startsWith('#'))return;
  if(/^(?:[a-z]+:|\/\/|\/)/i.test(raw)||/[?#%\\]/.test(raw))fail('invalid_first_load_reference');
  const segments=from.split('/');segments.pop();for(const segment of raw.split('/')){if(segment==='.'||!segment)continue;if(segment==='..'){if(!segments.length)fail('invalid_first_load_reference');segments.pop();}else segments.push(segment);}
  const path=segments.join('/');if(!Object.hasOwn(files,path))fail('missing_first_load_file');
  if(!included.has(path)){included.add(path);queue.push(path);}
 };
 if(spec.first_load!==undefined){if(!Array.isArray(spec.first_load)||spec.first_load.length>400)fail('invalid_first_load');for(const path of spec.first_load){if(typeof path!=='string'||!PERSISTENT_PATH.test(path))fail('invalid_first_load');add('index.html',path);}}
 while(queue.length){const path=queue.shift(),text=files[path];if(typeof text!=='string')continue;
  if(path.endsWith('.html')){
   const html=activeHtmlBoot(text);
   for(const tag of html.matchAll(/<([A-Za-z][A-Za-z0-9:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)){
    const attrs=attributes(tag[2]);
    if(attrs.has('srcset'))fail('persistent_srcset_unsupported');
    if(['script','link','img','source','video','audio'].includes(tag[1].toLowerCase()))for(const name of ['src','href','poster'])if(attrs.has(name))add(path,attrs.get(name));
    for(const m of (attrs.get('style')||'').matchAll(/(?:url\(\s*["']?([^\s"')]+)|@import\s*["']([^"']+))/gi))add(path,m[1]||m[2]);
   }
   for(const style of html.matchAll(/<style\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/style\s*>/gi))
    for(const m of style[1].matchAll(/(?:url\(\s*["']?([^\s"')]+)|@import\s*["']([^"']+))/gi))add(path,m[1]||m[2]);
  }
  if(path.endsWith('.css'))for(const m of text.matchAll(/(?:url\(\s*["']?([^\s"')]+)|@import\s*["']([^"']+))/gi))add(path,m[1]||m[2]);
  if(path.endsWith('.js'))for(const m of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g))add(path,m[1]);
 }
 for(const path of included)if(path!=='slop.spec.json'&&!spec.first_load.includes(path))fail('first_load_dependency_missing');
 included.delete('slop.spec.json');if(Object.hasOwn(files,'slop.spec.json'))included.add('slop.spec.json');
 let bytes=0;for(const path of included)bytes+=byteLengths.get(path);
 if(bytes>PERSISTENT_BUDGET.firstLoad)fail('first_load_too_large');return {paths:[...included],bytes};
}
function inspect(input,{retainDecoded=true,decodedInput=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_bundle');
 const files={...input};let spec={};
 if(files['slop.spec.json']!==undefined){try{spec=JSON.parse(files['slop.spec.json']);}catch{fail('invalid_spec');}if(!spec||typeof spec!=='object'||Array.isArray(spec))fail('invalid_spec');}
 const code=codeOrder(files),callsPersist=/\bSlop\s*\.\s*persist\s*\(/.test(code);
 const multiplayer=multiplayerContract(spec.multiplayer);
 if(multiplayer&&(spec.persistent===true||callsPersist))fail('persistent_multiplayer_conflict');
 const persistent=spec.persistent===true&&callsPersist;
 if(spec.persistent===true&&!callsPersist){delete spec.persistent;files['slop.spec.json']=JSON.stringify(spec);}
 const budget=persistent?PERSISTENT_BUDGET:ARCADE_BUDGET,paths=Object.keys(files);
 if(!paths.length||paths.length>budget.files||typeof files['index.html']!=='string'||!files['index.html'].trim())fail('invalid_bundle');
 let total=0;const decoded=new Map(),byteLengths=new Map();
 for(const path of paths){
  if(persistent&&/^(?:covers|previews)\//i.test(path))fail('reserved_media_path');
  if(path.length>160||(path!=='slop.spec.json'&&!(persistent?PERSISTENT_PATH:ARCADE_PATH).test(path)))fail('invalid_path');
  if(/slop.*(?:asset|entitlement)|(?:asset|entitlement).*manifest/i.test(path))fail('store_assets_not_supported');
  const trustedBinary=decodedInput&&BINARY.test(path);
  if(trustedBinary&&!(files[path] instanceof Uint8Array))fail('invalid_binary_file');
  const bytes=trustedBinary?files[path]:retainDecoded?fileBytes(path,files[path]):null,length=bytes?bytes.length:fileByteLength(path,files[path]);if(!length)fail('empty_file');total+=length;
  if(length>budget.file||total>budget.total)fail('bundle_too_large');if(retainDecoded&&bytes)decoded.set(path,bytes);byteLengths.set(path,length);
 }
 let boot=null;
 if(persistent){
  const persist=/\bawait\s+Slop\s*\.\s*persist\s*\(/.exec(code),ready=/\bSlop\s*\.\s*ready\s*\(/.exec(code);
  if(!persist||!ready||persist.index>ready.index)fail('persistent_before_ready_required');
  if(/\b(?:localStorage|sessionStorage|indexedDB)\b/.test(code))fail('persistent_storage_forbidden');
  if(!/\b\w+\s*\.\s*(?:commit|checkpoint)\s*\(/.test(code))fail('persistent_checkpoint_required');
  boot=firstLoad(files,spec,byteLengths);
 }
 return {files,persistent,multiplayer,budget,total,decoded,byteLengths,firstLoad:boot};
}
export function inspectBundle(input,{retainDecoded=true}={}){return inspect(input,{retainDecoded});}
// Storage attesters use their own decoded readbacks, not client JSON. The
// public admission path above never accepts typed arrays or this mode flag.
export function inspectDecodedBundle(input,{retainDecoded=false}={}){return inspect(input,{retainDecoded,decodedInput:true});}
