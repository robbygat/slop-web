import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const endpoint='https://api.slop.game/functions/v1/slop-aasa';
const root=resolve(process.argv[2]||'dist');
const expectedApple=JSON.parse(await readFile(new URL('../public/.well-known/apple-app-site-association',import.meta.url),'utf8'));
const expectedAndroid=JSON.parse(await readFile(new URL('../public/.well-known/assetlinks.json',import.meta.url),'utf8'));
async function fetchManifest(path,expected){
  const response=await fetch(endpoint+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('application/json'))throw new Error('Slop Supabase association endpoint is unavailable: '+response.status);
  const data=await response.json();
  if(JSON.stringify(data)!==JSON.stringify(expected))throw new Error('Association manifest differs from reviewed Slop source. Refusing to publish.');
  return JSON.stringify(data,null,2)+'\n';
}
const apple=await fetchManifest('',expectedApple),android=await fetchManifest('/assetlinks.json',expectedAndroid);
await mkdir(resolve(root,'.well-known'),{recursive:true});
await writeFile(resolve(root,'.well-known/apple-app-site-association'),apple);
await writeFile(resolve(root,'apple-app-site-association'),apple);
await writeFile(resolve(root,'.well-known/assetlinks.json'),android);
console.log('Mirrored reviewed Apple/Android link manifests from Slop Supabase.');
