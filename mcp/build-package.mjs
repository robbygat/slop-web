import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,readFile,rm,mkdtemp,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {basename,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=fileURLToPath(new URL('.',import.meta.url));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const temporaryRoot=await realpath(tmpdir());
const staging=await realpath(await mkdtemp(join(temporaryRoot,'slop-mcp-package-')));
const npmCli=process.env.npm_execpath || join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
try{
 // Run npm's JavaScript CLI directly: spawning npm.cmd is not portable and
 // enabling a shell would make paths with spaces/metacharacters unsafe.
 const [result]=JSON.parse(execFileSync(process.execPath,[npmCli,'pack','--json','--ignore-scripts','--pack-destination',staging],{cwd:root,encoding:'utf8',windowsHide:true}));
 if(basename(result.filename)!==result.filename)throw new Error('Unexpected package path.');
 const expected=['README.md','bundle-check.mjs','cli.mjs','client.mjs','game-template.mjs','package.json','pairing-display.mjs','runtime/creator-v1.js'];
 if(JSON.stringify(result.files.map(f=>f.path).sort())!==JSON.stringify(expected))throw new Error('Unexpected package file; download was not written.');
 const out=fileURLToPath(new URL('../public/downloads/',import.meta.url));await mkdir(out,{recursive:true});
 const name=`slop-game-mcp-${pkg.version}.tgz`;await copyFile(join(staging,result.filename),join(out,name));
 console.log(JSON.stringify({file:name,bytes:result.size,integrity:result.integrity,files:expected},null,2));
}finally{
 if(dirname(staging)!==temporaryRoot || !basename(staging).startsWith('slop-mcp-package-'))throw new Error('Refusing cleanup outside the package staging directory.');
 await rm(staging,{recursive:true,force:true});
}
