import cosmetics from '../data/robot-cosmetics.json' with {type:'json'};
export {cosmetics as ROBOT_COSMETICS};
export const ROBOT_SLOTS={shell:'Characters',finish:'Paint',face:'Faces',glow:'Glow',line:'Line style',fx:'Screen effects'};
export function canWearRobot(item,inventory,current){
 if(!item||!inventory?.robot_catalog_version)return false;
 if(item.tier==='starter'||inventory.owned_ids?.includes(item.id))return true;
 if(item.tier==='champion')return false;
 return inventory.robot_starter?.[item.slot]===item.value||current?.robot?.[item.slot]===item.value;
}
export function withRobotItem(look,inventory,item){return {...look,robot:{...(inventory?.robot_derived||{}),...(look?.robot||{}),[item.slot]:item.value}};}
export function sameRobotLook(a,b){
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 return JSON.stringify(stable(a||{}))===JSON.stringify(stable(b||{}));
}
export function robotEquipReceipt(receipt,requested){
 if(receipt?.code==='not_owned')throw new Error('That style is not in your collection yet. Choose an unlocked style.');
 if(receipt?.ok!==true||receipt.code!=='equipped'||!sameRobotLook(receipt.slop_look?.robot,requested.robot))throw new Error('The server did not confirm this look. Refresh your wardrobe and try again.');
 return receipt.slop_look;
}
export function createRobotAppearance({asOwner,result}){
 const profile=(client,owner)=>result(client.from('profiles').select('id,slop_look').eq('id',owner).single());
 const check=(actual,expected)=>{if(actual!==expected)throw new Error('Your account changed. Reopen your wardrobe.');};
 return {
  load:expected=>asOwner(async(owner,client)=>{check(owner,expected);const [row,inventory]=await Promise.all([profile(client,owner),result(client.rpc('my_slop_cosmetics'))]);if(row.id!==owner||inventory?.authenticated!==true||!inventory.robot_catalog_version)throw new Error('Your robot wardrobe could not be loaded. Please try again.');return {look:row.slop_look||{},inventory};}),
  save:(expected,original,next)=>asOwner(async(owner,client)=>{check(owner,expected);const before=await profile(client,owner);if(before.id!==owner||!sameRobotLook(before.slop_look,original))throw new Error('Your character changed on another screen. Reopen your wardrobe to use the latest look.');const saved=robotEquipReceipt(await result(client.rpc('equip_slop_look',{p_look:next})),next);const after=await profile(client,owner);if(after.id!==owner||!sameRobotLook(after.slop_look,saved))throw new Error('Your character changed while saving. Reopen your wardrobe to see its latest look.');return saved;}),
 };
}
