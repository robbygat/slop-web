import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,rm,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('.',import.meta.url));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const staging=await mkdtemp(join(tmpdir(),'slop-mcp-package-'));
try{
 const [result]=JSON.parse(execFileSync('npm',['pack','--json','--ignore-scripts','--pack-destination',staging],{cwd:root,encoding:'utf8'}));
 const expected=['README.md','cli.mjs','client.mjs','game-template.mjs','package.json','pairing-display.mjs','runtime/creator-v1.js'];
 if(JSON.stringify(result.files.map(f=>f.path).sort())!==JSON.stringify(expected))throw new Error('Unexpected package file; download was not written.');
 const out=fileURLToPath(new URL('../public/downloads/',import.meta.url));await mkdir(out,{recursive:true});
 const name=`slop-game-mcp-${pkg.version}.tgz`;await copyFile(join(staging,result.filename),join(out,name));
 console.log(JSON.stringify({file:name,bytes:result.size,integrity:result.integrity,files:expected},null,2));
}finally{await rm(staging,{recursive:true,force:true});}
