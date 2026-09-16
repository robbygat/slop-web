import {spawnSync} from 'node:child_process';
import {mkdir,cp,readFile} from 'node:fs/promises';
const input=process.env.SLOP_EYE_OUTPUT||'/tmp/slop-native-eye-portraits';
const output=new URL('../public/assets/mobile/eye-motion/',import.meta.url);
await mkdir(output,{recursive:true});
const catalog=JSON.parse(await readFile(input+'/catalog.json','utf8'));
for(const entry of catalog){
 for(const [command,args,name] of [
  ['img2webp',['-loop','0','-lossless','-m','3',...Array.from({length:96},(_,i)=>['-d',i%3===2?'84':'83',`${input}/${entry.id}/${String(i).padStart(3,'0')}.png`]).flat()],`${entry.id}.webp`],
  ['cwebp',['-quiet','-lossless',`${input}/${entry.id}/000.png`],`${entry.id}-poster.webp`],
 ]){
  const result=spawnSync(command,[...args,'-o',new URL(name,output).pathname],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
 }
 console.log('Encoded native eye portrait '+entry.id);
}
await cp(input+'/catalog.json',new URL('catalog.json',output));
