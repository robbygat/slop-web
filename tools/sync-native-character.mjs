import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const mobile=fileURLToPath(new URL('../../slop-mobile/lib/',import.meta.url));
const out=fileURLToPath(new URL('./native-character/lib/',import.meta.url));
const files=['models/slop_look.dart','widgets/slop_character.dart','widgets/slop_form_renderer.dart','widgets/slop_headpieces.dart','widgets/slop_toon_character.dart','widgets/slop_toon_parts_atlas.dart','widgets/slop_coin_mark.dart','widgets/slop_cape.dart','theme/tokens.dart','config/product_features.dart'];
const sha={};for(const file of files){const source=await readFile(mobile+file,'utf8');sha[file]=createHash('sha256').update(source).digest('hex');await writeFile(out+file,source);}
await writeFile(fileURLToPath(new URL('./native-character/mobile-source.json',import.meta.url)),JSON.stringify({source:'slop-mobile',files:sha},null,2)+'\n');
console.log('Copied the native painting closure. App stores and account authority remain isolated local stubs.');
