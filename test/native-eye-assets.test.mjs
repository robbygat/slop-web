import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lookSignature} from '../src/lib/slop-native-atlas.js';

test('Social native eye portraits are bounded animated WebPs with matching still posters', async()=>{
 const root=new URL('../public',import.meta.url),catalog=JSON.parse(await readFile(new URL('../public/assets/mobile/eye-motion/catalog.json',import.meta.url),'utf8'));
 assert.equal(new Set(catalog.map(x=>x.signature)).size,catalog.length);
 for(const look of [{},{body:'heart',palette:'bubblegum'},{body:'star',palette:'mint'}])assert.ok(catalog.some(x=>x.signature===lookSignature(look)));
 let total=0;
 for(const entry of catalog){
  assert.match(entry.url,/^\/assets\/mobile\/eye-motion\/[a-z0-9-]+\.webp$/);
  assert.equal(entry.poster,entry.url.replace('.webp','-poster.webp'));
  const [motion,poster]=await Promise.all([readFile(new URL('.'+entry.url,root+'/')),readFile(new URL('.'+entry.poster,root+'/'))]);
  total+=motion.length+poster.length;
  assert.ok(motion.length<600_000);
  for(const bytes of [motion,poster]){assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.equal(bytes.readUInt32LE(4)+8,bytes.length);}
  let frames=0,duration=0;
  for(let offset=12;offset+8<=motion.length;){const kind=motion.toString('ascii',offset,offset+4),size=motion.readUInt32LE(offset+4),data=offset+8;assert.ok(data+size<=motion.length);if(kind==='VP8X'){assert.equal(motion.readUIntLE(data+4,3)+1,384);assert.equal(motion.readUIntLE(data+7,3)+1,384);}if(kind==='ANMF'){frames++;duration+=motion.readUIntLE(data+12,3);}offset=data+size+(size%2);}
  assert.ok(frames>1&&frames<=96);
  assert.equal(duration,8000);
 }
 assert.ok(total<7_000_000);
});
