import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectBundle,fileBytes,PERSISTENT_BUDGET} from '../bundle-rules.mjs';
import {validateDraft,mime,MAX_DRAFT_BODY} from '../../supabase/functions/slop-mcp/contract.mjs';
import {bundleIdentity} from '../../src/lib/bundle-contracts.js';
const spec={persistent:true,first_load:['index.html','slop.js','game.js']};
const files=()=>({'index.html':'<script src="slop.js"></script><script src="game.js"></script>','slop.js':'// trusted runtime','game.js':'async function boot(){const save=await Slop.persist({version:1,run:{},profile:{}});save.commit();Slop.ready();}','slop.spec.json':JSON.stringify(spec)});
const binary=data=>({encoding:'base64',data:Buffer.from(data).toString('base64')});
const draft=files=>({project_id:'11111111-1111-4111-8111-111111111111',request_id:'22222222-2222-4222-8222-222222222222',revision:1,name:'World',files});
test('shared server/MCP decoded-byte contract is byte-identical',async()=>{assert.equal(await readFile(new URL('../bundle-rules.mjs',import.meta.url),'utf8'),await readFile(new URL('../../supabase/functions/slop-mcp/bundle-rules.mjs',import.meta.url),'utf8'));});
test('World binary bytes have identical local manifest and server manifest, not base64 hashes',async()=>{
 const f=files();f['slop.js']=await readFile(new URL('../runtime/persistent-v1.js',import.meta.url),'utf8');f['index.html']='<meta name="slop-runtime" content="persistent-v1">'+f['index.html'];f['zones/forge.glb']=binary(new Uint8Array([0x67,0x6c,0x54,0x46]));
 const local=await bundleIdentity(f),server=await validateDraft(draft(f));assert.equal(server.persistent,true);assert.equal(local.persistent,true);assert.deepEqual(local.manifest,server.manifest);assert.equal(local.digest,server.digest);assert.equal(server.manifest.find(x=>x.path.endsWith('.glb')).bytes,4);assert.equal(mime('forge.glb'),'model/gltf-binary');
});
test('Arcade limits and binary prohibition stay strict and spec-only flags cannot expand admission',()=>{
 const f=files();f['game.js']='Slop.ready();';f['zone.glb']=binary([1]);assert.throws(()=>inspectBundle(f),/invalid_path/);
 delete f['zone.glb'];const checked=inspectBundle(f);assert.equal(checked.persistent,false);assert.equal(JSON.parse(checked.files['slop.spec.json']).persistent,undefined);
 for(const code of ['/* Slop.persist() */ Slop.ready();','const fake="Slop.persist()";Slop.ready();']){f['game.js']=code;assert.equal(inspectBundle(f).persistent,false);}
 f['big.js']='x'.repeat(512001);assert.throws(()=>inspectBundle(f),/bundle_too_large/);
});
test('persistent real await before ready, checkpoints and no browser storage are required',()=>{
 for(const [code,error]of [['Slop.ready();const s=await Slop.persist({});s.commit();','before_ready'],['const s=Slop.persist({});s.commit();Slop.ready();','before_ready'],['const s=await Slop.persist({});Slop.ready();','checkpoint'],['const s=await Slop.persist({});s.commit();localStorage.x=1;Slop.ready();','storage']]){const f=files();f['game.js']=code;assert.throws(()=>inspectBundle(f),new RegExp(error));}
});
test('required first_load must include every static HTML/CSS/import dependency and boot assets',()=>{
 const f=files();f['slop.spec.json']='{"persistent":true}';assert.throws(()=>inspectBundle(f),/first_load_required/);
 f['slop.spec.json']=JSON.stringify(spec);f['index.html']+='<link rel="stylesheet" href="style.css">';f['style.css']='body{background:url(tile.webp)}';f['tile.webp']=binary([1,2]);assert.throws(()=>inspectBundle(f),/first_load_dependency_missing/);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'style.css','tile.webp']});assert.ok(inspectBundle(f).firstLoad.bytes>0);
 f['style.css']='@import "https://evil/style.css";';assert.throws(()=>inspectBundle(f),/first_load_reference/);
});
test('decimal 8MB asset is admitted only lazy; 5MB first-load and file caps are enforced',()=>{
 const f=files();f['zone.bin']=binary(new Uint8Array(8_000_000));assert.equal(inspectBundle(f).decoded.get('zone.bin').length,8_000_000);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'zone.bin']});assert.throws(()=>inspectBundle(f),/first_load_too_large/);
 f['slop.spec.json']=JSON.stringify(spec);f['zone.bin']=binary(new Uint8Array(8_000_001));assert.throws(()=>inspectBundle(f),/bundle_too_large/);
 assert.equal(PERSISTENT_BUDGET.total,50_000_000);assert.equal(PERSISTENT_BUDGET.files,400);assert.ok(MAX_DRAFT_BODY>50_000_000*4/3);
});
test('first load includes both video poster and source plus inline style images',()=>{
 const f=files();f['index.html']+='<video src="loop.ogg" poster="poster.webp"></video><style>body{background:url(back.jpg)}</style>';
 f['loop.ogg']=binary([1]);f['poster.webp']=binary([2]);f['back.jpg']=binary([3]);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'loop.ogg','poster.webp']});assert.throws(()=>inspectBundle(f),/dependency_missing/);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'loop.ogg','poster.webp','back.jpg']});assert.equal(inspectBundle(f).persistent,true);
});
test('canonical binary descriptor rejects whitespace, bad pad bits, extra keys and raw binary string',()=>{
 for(const value of [{encoding:'base64',data:'AQ==\n'},{encoding:'base64',data:'AR=='},{encoding:'base64',data:'AQ==',url:'https://evil'},'AQ==',{encoding:'hex',data:'01'}])assert.throws(()=>fileBytes('zone.glb',value),/invalid_binary/);
 assert.throws(()=>fileBytes('zone.exe',binary([1])),/invalid_binary/);
});
test('unloaded JS cannot grant persistence or the larger World budget',()=>{
 const f=files();f['unused.js']=f['game.js'];f['game.js']='window.noop=true;';
 assert.equal(inspectBundle(f).persistent,false);
 f['large.js']='x'.repeat(512001);assert.throws(()=>inspectBundle(f),/bundle_too_large/);
});
test('inert template scripts cannot grant World capability or change boot closure',()=>{
 const inert=files();inert['game.js']='window.noop=true;';
 inert['index.html']+='<template><template></template><script>const save=await Slop.persist({});save.commit();Slop.ready();</script></template>';
 assert.equal(inspectBundle(inert).persistent,false);
 inert['game.js']='Slop.ready();';assert.equal(inspectBundle(inert).persistent,false);
 const active=files();active['index.html']+='<template><script src=not-loaded.js></script><img src=not-loaded.webp><style>body{background:url(missing.jpg)}</style></template>';
 assert.equal(inspectBundle(active).persistent,true);
 active['index.html']='<script>const example="<template>";</script>'+active['index.html'];
 assert.equal(inspectBundle(active).persistent,true);
 const quoted=files();quoted['game.js']='window.noop=true;';
 quoted['index.html']+='<template><div title="</template>"></div><script>const s=await Slop.persist({});s.commit();Slop.ready();</script></template>';
 assert.equal(inspectBundle(quoted).persistent,false);
});
test('unquoted HTML dependencies are required in the first-load closure',()=>{
 for(const [tag,path,value]of [['<script src=extra.js></script>','extra.js','window.extra=true;'],['<link rel=stylesheet href=style.css>','style.css','body{color:red}'],['<video src=loop.ogg poster=poster.webp></video>','loop.ogg',binary([1])]]){
  const f=files();f['index.html']+=tag;f[path]=value;f['poster.webp']=binary([2]);
  assert.throws(()=>inspectBundle(f),/first_load_dependency_missing/);
 }
 const f=files();f['index.html']='<script src=slop.js></script><script src=game.js></script><img src=poster.webp>';
 f['poster.webp']=binary([2]);assert.throws(()=>inspectBundle(f),/first_load_dependency_missing/);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'poster.webp']});assert.equal(inspectBundle(f).persistent,true);
});
test('World source reserves captured-media folders without changing Arcade admission',()=>{
 for(const prefix of ['covers/','previews/']){
  const f=files();f[`${prefix}hidden.bin`]=binary([1]);assert.throws(()=>inspectBundle(f),/reserved_media_path/);
  delete f[`${prefix}hidden.bin`];f[`${prefix}helper.js`]='window.helper=true;';assert.throws(()=>inspectBundle(f),/reserved_media_path/);
  f['game.js']='Slop.ready();';assert.equal(inspectBundle(f).persistent,false);
 }
});
test('unquoted inline style and poster count, while unsupported srcset fails closed',()=>{
 const f=files();f['index.html']+='<div title="literal > boundary" style=background:url(back.jpg)></div><video poster=poster.webp></video>';
 f['back.jpg']=binary([1]);f['poster.webp']=binary([2]);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'poster.webp']});assert.throws(()=>inspectBundle(f),/dependency_missing/);
 f['slop.spec.json']=JSON.stringify({...spec,first_load:[...spec.first_load,'back.jpg','poster.webp']});assert.equal(inspectBundle(f).persistent,true);
 f['index.html']+='<img srcset="back.jpg 1x, poster.webp 2x">';assert.throws(()=>inspectBundle(f),/srcset_unsupported/);
});
