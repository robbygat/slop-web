import {spawnSync} from 'node:child_process';
import {mkdir,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const cwd=new URL('./native-character/',import.meta.url);
for(const args of [['pub','get'],['build','web','--release','--base-href','/native-character/','--pwa-strategy','none','--no-wasm-dry-run']]){
 const result=spawnSync('flutter',args,{cwd,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
const source=new URL('./native-character/build/web/',import.meta.url),output=new URL('../public/native-character/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of ['index.html','flutter_bootstrap.js','flutter.js','main.dart.js','assets'])await cp(new URL(file,source),new URL(file,output),{recursive:true});
// Version every link in the entry -> bootstrap -> Dart chain. An existing
// browser must not reuse the previous character behavior from its JS cache.
const main=await readFile(new URL('main.dart.js',source)),bootstrap=await readFile(new URL('flutter_bootstrap.js',source),'utf8'),index=await readFile(new URL('index.html',source),'utf8');
const version=createHash('sha256').update(main).update(bootstrap).update(index).digest('hex').slice(0,20);
if(!bootstrap.includes('"mainJsPath":"main.dart.js"')||!index.includes('src="flutter_bootstrap.js"'))throw new Error('Unexpected Flutter loader format; refusing an unversioned renderer release.');
await writeFile(new URL('flutter_bootstrap.js',output),bootstrap.replace('"mainJsPath":"main.dart.js"',`"mainJsPath":"main.dart.js?v=${version}"`));
await writeFile(new URL('index.html',output),index.replace('src="flutter_bootstrap.js"',`src="flutter_bootstrap.js?v=${version}"`));
await writeFile(new URL('version.json',output),JSON.stringify({version,entry:`/native-character/index.html?v=${version}`})+'\n');
await cp(new URL('./native-character/fonts/Gabarito-OFL.txt',import.meta.url),new URL('assets/fonts/Gabarito-OFL.txt',output));
await rm(new URL('assets/fonts/Roboto-Regular.ttf',output),{force:true});
await mkdir(new URL('canvaskit/',output),{recursive:true});
for(const file of ['canvaskit.js','canvaskit.wasm'])await cp(new URL('canvaskit/'+file,source),new URL('canvaskit/'+file,output));
console.log('Published the character-only Flutter runtime with local CanvasKit.');
