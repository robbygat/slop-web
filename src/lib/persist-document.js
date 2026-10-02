const mime=path=>({js:'text/javascript',css:'text/css',svg:'image/svg+xml',jpg:'image/jpeg',webp:'image/webp',ogg:'audio/ogg',glb:'model/gltf-binary',json:'application/json'}[path.split('.').at(-1)]||'application/octet-stream');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const dataUrl=(path,bytes)=>{let raw='';for(let n=0;n<bytes.length;n+=8192)raw+=String.fromCharCode(...bytes.subarray(n,n+8192));return `data:${mime(path)};base64,${btoa(raw)}`;};
// Only the host reads boot assets. Rewrites use already hash-verified bytes,
// preserve authored source order, and run inside the existing opaque frame.
export async function preparePersistentDocument(doc,{read,sourceBytes}){
 if(doc.querySelector('[srcset]'))throw Error('Slop World boot srcset is unsupported. Declare one verified source per image.');
 const specBytes=await read('slop.spec.json'),spec=JSON.parse(text(specBytes));
 if(spec.persistent!==true||!Array.isArray(spec.first_load)||!spec.first_load.includes('index.html'))throw Error('Missing Slop World boot manifest.');
 const assets=new Map([['slop.spec.json',specBytes]]);let total=specBytes.length+sourceBytes;
 for(const path of new Set(spec.first_load)){
  if(path==='index.html'||path==='slop.spec.json')continue;
  const bytes=await read(path);total+=bytes.length;if(total>5_000_000)throw Error('This Slop World exceeds its 5 MB boot budget.');assets.set(path,bytes);
 }
 const base='https://release.invalid/';
 const resolve=(from,raw)=>{
  const url=new URL(raw,new URL(from,base));
  if(url.origin!=='https://release.invalid'||url.search||url.hash||/%|\\/.test(raw))throw Error('Boot asset escaped its own release.');
  const path=url.pathname.slice(1);if(!assets.has(path))throw Error('A first-frame asset is missing from first_load.');return path;
 };
 const css=(source,from,seen=new Set())=>{
  if(seen.has(from))throw Error('Cyclic boot stylesheet import.');seen=new Set([...seen,from]);
  const imported=source.replace(/@import\s*(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s"'()]+))\s*\)|"([^"]+)"|'([^']+)')\s*([^;]*);/gi,(_m,doubleUrl,singleUrl,unquotedUrl,doubleBare,singleBare,media)=>{
   const raw=doubleUrl??singleUrl??unquotedUrl??doubleBare??singleBare;
   const path=resolve(from,raw),body=css(text(assets.get(path)),path,seen);return media.trim()?`@media ${media}{${body}}`:body;
  });
  return imported.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,(match,_quote,raw)=>{
   raw=raw.trim();if(raw.startsWith('data:')||raw.startsWith('#'))return match;
   const path=resolve(from,raw);return `url("${dataUrl(path,assets.get(path))}")`;
  });
 };
 // Module graphs need their own opaque-frame Blob URLs: browser HTTP caches
 // alone do not guarantee offline imports. Absolute virtual specifiers plus
 // one import map preserve cycles and relative paths without extra fetches.
 const modulePattern=/(\b(?:import|export)\s+(?:[^;\n]*?\sfrom\s*)?["'])([^"']+)(["'])/g;
 const modules=new Map();
 const moduleSource=(source,path)=>source.replace(modulePattern,(_all,before,raw,after)=>{
  const dependency=resolve(path,raw);if(!dependency.endsWith('.js'))throw Error('Boot modules must be JavaScript.');
  if(!modules.has(dependency)){modules.set(dependency,null);modules.set(dependency,moduleSource(text(assets.get(dependency)),dependency));}
  return before+base+dependency+after;
 });
 for(const node of doc.querySelectorAll('script[src]')){
  const path=resolve('index.html',node.getAttribute('src'));node.removeAttribute('src');
  const source=text(assets.get(path));node.textContent=(node.getAttribute('type')==='module'?moduleSource(source,path):source).replace(/<\/script/gi,'<\\/script');
 }
 for(const node of doc.querySelectorAll('script[type="module"]'))node.textContent=moduleSource(node.textContent,'index.html');
 if(modules.size){
  const bootstrap=doc.createElement('script'),payload=JSON.stringify([...modules].map(([path,code])=>[base+path,code])).replace(/</g,'\\u003c');
  bootstrap.textContent=`(()=>{const urls=[],imports={};for(const[path,code]of ${payload}){const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));imports[path]=url;urls.push(url);}const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.currentScript.after(map);addEventListener('pagehide',()=>urls.forEach(url=>URL.revokeObjectURL(url)),{once:true});})();`;
  doc.head.prepend(bootstrap);
 }
 for(const node of doc.querySelectorAll('link[rel="stylesheet"][href]')){
  const path=resolve('index.html',node.getAttribute('href')),style=doc.createElement('style');style.textContent=css(text(assets.get(path)),path);
  if(node.hasAttribute('media'))style.setAttribute('media',node.getAttribute('media'));
  node.replaceWith(style);
 }
 for(const node of doc.querySelectorAll('style'))node.textContent=css(node.textContent,'index.html');
 for(const node of doc.querySelectorAll('[style]'))node.setAttribute('style',css(node.getAttribute('style'),'index.html'));
 for(const node of doc.querySelectorAll('img[src],source[src],audio[src],video[src],video[poster]'))for(const attribute of ['src','poster']){
  const raw=node.getAttribute(attribute);if(!raw||raw.startsWith('data:'))continue;const path=resolve('index.html',raw);node.setAttribute(attribute,dataUrl(path,assets.get(path)));
 }
 // Hints would redundantly fetch originals after their code was inlined.
 doc.querySelectorAll('link[rel="preload"],link[rel="modulepreload"],link[rel="prefetch"]').forEach(node=>node.remove());
 return {bytes:total,paths:[...assets.keys()]};
}
