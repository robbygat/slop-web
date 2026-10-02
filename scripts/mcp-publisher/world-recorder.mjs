// Source-bundle admission and platform scaffolding for isolated World captures.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {inspectBundle,fileBytes} from '../../mcp/bundle-rules.mjs';
import {mcpRuntimeProblem} from '../../src/lib/mcp-runtime.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
export const recorderFileBytes=(path,value)=>Buffer.from(fileBytes(path,value));
export function recorderManifest(files){return Object.keys(files).sort().map(path=>{
 const bytes=recorderFileBytes(path,files[path]);
 return {path:`1.0.0/${path}`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});}
export function hasWorldMarker(html){
 const source=String(html||'').replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<template\b[\s\S]*?<\/template\s*>/gi,'');
 for(const match of source.matchAll(/<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const attrs=new Map();for(const attr of match[1].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   const key=attr[1].toLowerCase();if(!attrs.has(key))attrs.set(key,attr[2]??attr[3]??attr[4]);
  }
  if(attrs.get('name')?.toLowerCase()==='slop-runtime'&&attrs.get('content')==='persistent-v1')return true;
 }
 return false;
}
export function recorderWorldConfig(files){
 let declared=false;try{declared=JSON.parse(files?.['slop.spec.json']||'{}').persistent===true;}catch{if(hasWorldMarker(files?.['index.html']))throw Error('runtime_invalid');}
 if(!declared&&!hasWorldMarker(files?.['index.html']))return null;
 const checked=inspectBundle(files),manifest=recorderManifest(checked.files);
 if(!checked.persistent||mcpRuntimeProblem(manifest,files['index.html'],{persistent:true}))throw Error('runtime_invalid');
 const digest=createHash('sha256').update(manifest.map(f=>`${f.path}:${f.bytes}:${f.sha256}`).join('\n')).digest('hex');
 return {manifest,firstLoad:checked.firstLoad.paths,entry:`https://api.slop.game/storage/v1/object/public/games/releases/${digest}/recorder-world/1.0.0/index.html`,inputPolicy:'world-hold-and-tap'};
}
export const scriptJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export const worldCaptureProblem=state=>!state?.ready||!state.initialized?'not_ready':state.errors?'boot_error':state.active?'recorder_error':null;
let compiled;
export async function worldRecorderBundle(){
 return compiled??=(async()=>{
  const {build}=await import('vite');
  const result=await build({root,configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:join(root,'scripts/mcp-publisher/world-recorder-host.js'),formats:['iife'],name:'SlopWorldRecorder',fileName:()=> 'world-recorder.js'}}});
  return (Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk').code.replace(/<\/script/gi,'<\\/script');
 })();
}
export async function worldEngineScript(config){
 if(!config)return '';
 const engine=await readFile(join(root,'src/lib/vendor/three-r128.js'),'utf8');
 return `<script>Object.defineProperty(window,'__slopPersistAssets',{value:Object.freeze({base:${scriptJson(config.entry.slice(0,config.entry.lastIndexOf('/')+1))}}),writable:false,configurable:false});\n${engine.replace(/<\/script/gi,'<\\/script')}</script>`;
}
// Generic World touch repertoire: a sustained hold, release, two taps, then
// another hold. Actual motion gates still apply; no title/state/score cheats.
export function worldMobileInputFrame(frame,{width,height}){
 if(!Number.isInteger(frame)||frame<0||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw TypeError('Invalid World input frame');
 const f=frame%240,point={x:width*.6,y:height*.55};
 if(f===0||f===180)return [{type:'touchStart',...point}];
 if(f===150||f===239)return [{type:'touchEnd'}];
 if(f===157||f===169)return [{type:'touchStart',...point},{type:'touchEnd'}];
 return [];
}
