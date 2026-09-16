// Every portrait comes from the mobile Flutter painter. The small appearance
// catalog covers current public looks without starting an engine for each card.
import catalog from '../../public/assets/mobile/portraits/catalog.json' with {type:'json'};
import {lookSignature} from './slop-native-atlas.js';
const portraits=new Map();
const equippedPortraits=new Map(catalog.map(entry=>[entry.signature,entry.url]));
export const nativePortrait=look=>equippedPortraits.get(lookSignature(look))||null;
export async function slopAvatar(look) {
 const native=await import('./slop-native-atlas.js');
 const key=native.lookSignature(look);
 if(portraits.has(key))return portraits.get(key);
 const equipped=equippedPortraits.get(key);
 if(equipped)return equipped;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
 const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
 const atlas=await native.loadNativeAtlas(look);
 if(atlas)native.drawNativeAtlas(context,atlas,{width:512,height:512,angle:0,reducedMotion:true});
 else throw new Error('This native appearance is still loading');
 const portrait=canvas.toDataURL('image/webp');
 portraits.set(key,portrait);
 if(portraits.size>64)portraits.delete(portraits.keys().next().value);
 return portrait;
}
