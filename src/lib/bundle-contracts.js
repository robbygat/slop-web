import {SlopError} from './contracts.js';
const encoder=new TextEncoder();
export const mime=path=>({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8'}[path.split('.').pop()]||'application/octet-stream');
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?encoder.encode(bytes):bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function bundleIdentity(files){
 if(!files||typeof files!=='object'||Array.isArray(files)||!files['index.html'])throw new SlopError('invalid_response');
 const paths=Object.keys(files).sort();if(paths.length>512)throw new SlopError('invalid_response');
 const canonical=[],manifest=[];let total=0;
 for(const path of paths){
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,219}$/.test(path)||path.includes('..')||path.includes('//')||!Object.hasOwn(files,path)||typeof files[path]!=='string')throw new SlopError('invalid_response');
  const name=encoder.encode(path),bytes=encoder.encode(files[path]);total+=bytes.length;
  if(bytes.length>2*1024*1024||!bytes.length||total>16*1024*1024)throw new SlopError('invalid_response');
  canonical.push(encoder.encode(`${name.length}:`),name,new Uint8Array([0]),encoder.encode(`${bytes.length}:`),bytes,new Uint8Array([255]));
  manifest.push({path:`1.0.0/${path}`,bytes:bytes.length,sha256:await sha256(bytes)});
 }
 const serialized=new Uint8Array(canonical.reduce((n,b)=>n+b.length,0));let offset=0;for(const bytes of canonical){serialized.set(bytes,offset);offset+=bytes.length;}
 return {buildId:`b3-${(await sha256(serialized)).slice(0,32)}`,manifest,digest:await sha256(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n'))};
}
