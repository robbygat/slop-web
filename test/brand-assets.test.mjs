import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';

test('site metadata and UI asset references survive removal of obsolete artwork',async()=>{
 const root=new URL('../',import.meta.url);
 async function walk(folder){const entries=await readdir(new URL(folder,root),{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(folder+e.name+'/'):folder+e.name))).flat();}
 const files=['index.html','tools/postbuild-routes.mjs',...(await walk('src/')).filter(p=>/\.(js|jsx|ts|css)$/.test(p))];
 const checked=new Set();
 for(const file of files){const text=await readFile(new URL(file,root),'utf8');
  for(const match of text.matchAll(/(?:https:\/\/slop\.game)?(\/assets\/[^\s"'`?#(){}<>]+\.(?:webp|png|jpg|svg|woff2|glb))/g)){
   const asset=match[1];if(checked.has(asset))continue;checked.add(asset);
   await assert.doesNotReject(access(new URL('public'+asset,root)),`${file}: ${asset}`);
  }
 }
 assert.ok(checked.size>=8,`Expected meaningful asset coverage, checked ${checked.size}`);
});
