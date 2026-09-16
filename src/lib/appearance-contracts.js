import options from './slop-options.json' with {type:'json'};
import {SlopError} from './contracts.js';

export const lookOptions=options.slots;
const defaults={designVersion:7,palette:'tangerine',body:'ghost',eyes:'cyclops',eyeColor:'ink',mouth:'smile',hat:'none',pattern:'none',finish:'jelly',aura:'bubbles',accessory:'none',cape:'none',blush:true,name:'Slop'};
const eyeGear=new Set(['glasses','shades','monocle','eyepatch','mask']);
export function normalizedLook(raw){
 const look={...defaults};
 for(const [slot,values] of Object.entries(lookOptions))if(values.some(v=>v.id===raw?.[slot]))look[slot]=raw[slot];
 if(typeof raw?.blush==='boolean')look.blush=raw.blush;
 if(typeof raw?.name==='string'&&raw.name.trim())look.name=raw.name.trim().slice(0,40);
 if((['cyclops','slopCyclops'].includes(look.eyes)&&['glasses','shades'].includes(look.accessory))||(['three','visor'].includes(look.eyes)&&eyeGear.has(look.accessory)))look.accessory='none';
 return look;
}
export const sameLook=(a,b)=>JSON.stringify(normalizedLook(a))===JSON.stringify(normalizedLook(b));
export function lookChoice(slot,id,{ownedIds=[],catalog=[],current}={}){
 const item=catalog.find(c=>c.slot===slot&&c.look?.[slot]===id);
 const unavailable=(slot==='hat'&&id==='itCouldBeWorse')||(slot==='pattern'&&id==='itCouldBeWorseRobot');
 // These two new mobile promotion traits are not accepted by the deployed
 // appearance validator yet. Do not advertise a save the server rejects.
 return {item,unavailable,allowed:!unavailable&&(!item||ownedIds.includes(item.id)||current?.[slot]===id)};
}
export function equipReceipt(receipt,requested){
 if(receipt?.ok!==true){
  if(receipt?.code==='not_owned')throw new SlopError('not_owned','This look is not in your wardrobe yet. Choose an unlocked style.');
  if(receipt?.code==='profile_missing')throw new SlopError('profile_missing','Your profile is not ready. Reopen your profile and try again.');
  throw new SlopError('invalid_response','This look could not be saved. Your current Slop is unchanged.');
 }
 if(receipt.code!=='equipped'||!receipt.slop_look||!sameLook(receipt.slop_look,requested))throw new SlopError('invalid_response');
 return normalizedLook(receipt.slop_look);
}
export function createAppearanceService({asOwner,result}){
 const profile=(client,owner)=>result(client.from('profiles').select('id,slop_look').eq('id',owner).single());
 const check=(owner,expected)=>{if(owner!==expected)throw new SlopError('account_changed');};
 return {
  load:expected=>asOwner(async(owner,client)=>{check(owner,expected);const [row,wardrobe]=await Promise.all([profile(client,owner),result(client.rpc('my_slop_cosmetics'))]);if(row.id!==owner||wardrobe?.authenticated!==true||!Array.isArray(wardrobe.owned_ids))throw new SlopError('invalid_response');return {owner,look:normalizedLook(row.slop_look),ownedIds:wardrobe.owned_ids};}),
  save:(expected,original,next)=>asOwner(async(owner,client)=>{
   check(owner,expected);const before=await profile(client,owner);
   if(before.id!==owner)throw new SlopError('invalid_response');
   if(!sameLook(before.slop_look,original))throw new SlopError('version_changed','Your Slop changed on another screen. Reopen the editor to use the latest look.');
   const requested=normalizedLook(next),receipt=equipReceipt(await result(client.rpc('equip_slop_look',{p_look:requested})),requested);
   const after=await profile(client,owner);
   if(after.id!==owner||!sameLook(after.slop_look,receipt))throw new SlopError('version_changed','Your Slop changed while saving. Reopen the editor to see its current look.');
   return receipt;
  }),
 };
}
