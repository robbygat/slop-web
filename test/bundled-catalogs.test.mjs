import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const copies=[
 ['public/native-character/version.json','src/data/native-character-version.json'],
 ['public/assets/mobile/eye-motion/catalog.json','src/data/mobile/eye-motion-catalog.json'],
 ['public/assets/mobile/portraits/catalog.json','src/data/mobile/portraits-catalog.json'],
 ['public/assets/mobile/cosmetics/catalog.json','src/data/mobile/cosmetics-catalog.json'],
 ['public/assets/mobile/turntables/catalog.json','src/data/mobile/turntables-catalog.json'],
];

test('bundled UI catalogs match the public mobile asset manifests',async()=>{
 for(const [published,bundled] of copies)assert.equal(await readFile(bundled,'utf8'),await readFile(published,'utf8'),`${bundled} must be refreshed with ${published}`);
});
