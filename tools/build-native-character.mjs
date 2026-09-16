import {spawnSync} from 'node:child_process';
import {mkdir,cp,rm,readFile} from 'node:fs/promises';
const cwd=new URL('./native-character/',import.meta.url);
for(const args of [['pub','get'],['build','web','--release','--base-href','/native-character/','--pwa-strategy','none','--no-wasm-dry-run']]){
 const result=spawnSync('flutter',args,{cwd,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
const source=new URL('./native-character/build/web/',import.meta.url),output=new URL('../public/native-character/',import.meta.url);
await mkdir(output,{recursive:true});
for(const file of ['index.html','flutter_bootstrap.js','flutter.js','main.dart.js','assets'])await cp(new URL(file,source),new URL(file,output),{recursive:true});
await cp(new URL('./native-character/fonts/Gabarito-OFL.txt',import.meta.url),new URL('assets/fonts/Gabarito-OFL.txt',output));
await rm(new URL('assets/fonts/Roboto-Regular.ttf',output),{force:true});
await mkdir(new URL('canvaskit/',output),{recursive:true});
for(const file of ['canvaskit.js','canvaskit.wasm'])await cp(new URL('canvaskit/'+file,source),new URL('canvaskit/'+file,output));
console.log('Published the character-only Flutter runtime with local CanvasKit.');
