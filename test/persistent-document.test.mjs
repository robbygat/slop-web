import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from 'linkedom';
import vm from 'node:vm';
import {preparePersistentDocument} from '../src/lib/persist-document.js';
const encode=value=>new TextEncoder().encode(value);
test('hash-read boot files inline in original order and CSS/images no longer need network on reopen',async()=>{
 const html='<html><head><link rel="stylesheet" href="style.css"></head><body><img src="card.webp"><script src="slop.js"></script><script src="game.js"></script></body></html>';
 const files={'slop.js':encode('window.Slop={};'),'game.js':encode('Slop.started=true;'),'style.css':encode('@import "nested/paint.css";body{background:url(card.webp)}'),'nested/paint.css':encode('img{background:url(../card.webp)}'),'card.webp':new Uint8Array([1,2,3])};
 files['slop.spec.json']=encode(JSON.stringify({persistent:true,first_load:['index.html',...Object.keys(files)]}));const read=[];
 const doc=new DOMParser().parseFromString(html,'text/html');await preparePersistentDocument(doc,{sourceBytes:html.length,read:async path=>{read.push(path);return files[path];}});
 assert.deepEqual([...doc.querySelectorAll('script')].map(x=>x.textContent),['window.Slop={};','Slop.started=true;']);assert.equal(doc.querySelector('script[src]'),null);
 assert.equal(doc.querySelector('link[rel=stylesheet]'),null);assert.match(doc.querySelector('style').textContent,/data:image\/webp;base64,AQID/);assert.match(doc.querySelector('img').getAttribute('src'),/^data:image\/webp/);
 assert.equal(read.filter(x=>x==='card.webp').length,1);
});
test('static module dependencies use an in-frame Blob import map, including cyclic graphs',async()=>{
 const files={'entry.js':encode('import {a} from "./nested/a.js"; window.result=a;'),'nested/a.js':encode('export {b} from "../b.js"; export const a=1;'),'b.js':encode('import {a} from "./nested/a.js"; export const b=2;')};
 files['slop.spec.json']=encode(JSON.stringify({persistent:true,first_load:['index.html',...Object.keys(files)]}));
 const doc=new DOMParser().parseFromString('<html><head></head><body><script type="module" src="entry.js"></script></body></html>','text/html');
 await preparePersistentDocument(doc,{sourceBytes:100,read:async path=>files[path]});
 assert.match(doc.querySelector('script[type=module]').textContent,/https:\/\/release.invalid\/nested\/a.js/);
 const blobs=[],maps=[];let close;
 vm.runInNewContext(doc.head.querySelector('script').textContent,{Blob,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:null/'+blobs.length;},revokeObjectURL:()=>{}},document:{createElement:()=>({}),currentScript:{after:map=>maps.push(map)}},addEventListener:(_type,callback)=>close=callback});
 assert.deepEqual(Object.keys(JSON.parse(maps[0].textContent).imports).sort(),['https://release.invalid/b.js','https://release.invalid/nested/a.js']);
 assert.match(await blobs[0].text(),/https:\/\/release.invalid\/b.js/);assert.equal(typeof close,'function');
});
test('missing declared boot dependency and escape are errors, never unauthenticated fallback fetch',async()=>{
 const spec=encode(JSON.stringify({persistent:true,first_load:['index.html']}));
 for(const source of ['<script src="missing.js"></script>','<script src="https://evil.test/a.js"></script>']){
  const doc=new DOMParser().parseFromString(`<html><head></head><body>${source}</body></html>`,'text/html');
  await assert.rejects(preparePersistentDocument(doc,{sourceBytes:source.length,read:async()=>spec}),/missing|escaped/);
 }
});
test('cached stylesheet imports preserve unquoted URLs and outer media semantics',async()=>{
 const html='<html><head><link rel="stylesheet" media="(min-width: 900px)" href="nested/style.css"></head><body></body></html>';
 const files={'nested/style.css':encode('@import url(./paint.css) screen and (orientation: landscape);body{color:lime}'),'nested/paint.css':encode('main{background:url(../card.webp)}'),'card.webp':new Uint8Array([1,2,3])};
 files['slop.spec.json']=encode(JSON.stringify({persistent:true,first_load:['index.html',...Object.keys(files)]}));
 const doc=new DOMParser().parseFromString(html,'text/html');await preparePersistentDocument(doc,{sourceBytes:html.length,read:async path=>files[path]});
 const style=doc.querySelector('style');assert.equal(style.getAttribute('media'),'(min-width: 900px)');
 assert.match(style.textContent,/@media screen and \(orientation: landscape\)\{main\{background:url\("data:image\/webp;base64,AQID"\)\}\}/);
 assert.doesNotMatch(style.textContent,/@import|paint\.css/);
});
test('unsupported srcset is rejected by cached boot, not left as an original network request',async()=>{
 const spec=encode(JSON.stringify({persistent:true,first_load:['index.html']}));
 const doc=new DOMParser().parseFromString('<html><head></head><body><img srcset="unexpected.webp 2x"></body></html>','text/html');
 await assert.rejects(preparePersistentDocument(doc,{sourceBytes:100,read:async()=>spec}),/srcset/);
});
