import {SlopError} from './contracts.js';
import {inspectBundle,fileBytes} from '../../mcp/bundle-rules.mjs';
export {fileBytes};
export const normalizeBundleFiles=files=>inspectBundle(files).files;
export function fileValue(path,bytes){
 if(/\.(?:html|js|css|json|svg|txt)$/.test(path))return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {encoding:'base64',data:btoa(raw)};
}
const encoder=new TextEncoder();
export const mime=path=>({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8',glb:'model/gltf-binary',bin:'application/octet-stream',jpg:'image/jpeg',webp:'image/webp',ktx2:'image/ktx2',ogg:'audio/ogg'}[path.split('.').pop()]||'application/octet-stream');
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?encoder.encode(bytes):bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function bundleIdentity(files){
 if(!files||typeof files!=='object'||Array.isArray(files)||!files['index.html'])throw new SlopError('invalid_response');
 let checked;try{checked=inspectBundle(files);}catch(error){throw new SlopError('invalid_response',error.message);}
 files=checked.files;const paths=Object.keys(files).sort();
 const canonical=[],manifest=[];let total=0;
 for(const path of paths){
  const name=encoder.encode(path),bytes=checked.decoded.get(path);total+=bytes.length;
  canonical.push(encoder.encode(`${name.length}:`),name,new Uint8Array([0]),encoder.encode(`${bytes.length}:`),bytes,new Uint8Array([255]));
  manifest.push({path:`1.0.0/${path}`,bytes:bytes.length,sha256:await sha256(bytes)});
 }
 const serialized=new Uint8Array(canonical.reduce((n,b)=>n+b.length,0));let offset=0;for(const bytes of canonical){serialized.set(bytes,offset);offset+=bytes.length;}
 return {buildId:`b3-${(await sha256(serialized)).slice(0,32)}`,manifest,digest:await sha256(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n')),persistent:checked.persistent,files};
}
