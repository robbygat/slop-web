import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('published native renderer invalidates every cached loader in its content-bound entry chain', async()=>{
 const root=new URL('../public/native-character/',import.meta.url);
 const [versionText,index,bootstrap,main]=await Promise.all([
  readFile(new URL('version.json',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('flutter_bootstrap.js',root),'utf8'),
  readFile(new URL('main.dart.js',root)),
 ]);
 const {version,entry}=JSON.parse(versionText);
 assert.match(version,/^[a-f0-9]{20}$/);
 assert.equal(entry,`/native-character/index.html?v=${version}`);
 assert.ok(index.includes(`src="flutter_bootstrap.js?v=${version}"`));
 assert.ok(bootstrap.includes(`"mainJsPath":"main.dart.js?v=${version}"`));
 const originalBootstrap=bootstrap.replace(`"mainJsPath":"main.dart.js?v=${version}"`,'"mainJsPath":"main.dart.js"');
 const originalIndex=index.replace(`src="flutter_bootstrap.js?v=${version}"`,'src="flutter_bootstrap.js"');
 assert.equal(createHash('sha256').update(main).update(originalBootstrap).update(originalIndex).digest('hex').slice(0,20),version);
});
