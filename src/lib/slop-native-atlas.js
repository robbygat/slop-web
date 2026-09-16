import catalog from '../../public/assets/mobile/turntables/catalog.json' with {type:'json'};
const fields=['body','palette','eyes','eyeColor','mouth','hat','pattern','finish','aura','accessory','cape','blush'];
const defaults={body:'ghost',palette:'tangerine',eyes:'cyclops',eyeColor:'ink',mouth:'smile',hat:'none',pattern:'none',finish:'jelly',aura:'bubbles',accessory:'none',cape:'none',blush:true};
export const lookSignature=look=>JSON.stringify(fields.map(key=>look?.[key]??defaults[key]));
const entries=new Map(catalog.map(entry=>[lookSignature(entry.look),entry])),loaded=new Map();
export function nativeAtlasFor(look){return entries.get(lookSignature(look))||null;}
export async function loadNativeAtlas(look){
 const entry=nativeAtlasFor(look);if(!entry)return null;
 if(!loaded.has(entry.id))loaded.set(entry.id,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({...entry,image});image.onerror=()=>{loaded.delete(entry.id);reject(new Error('Native character could not load'));};image.src=entry.url;}));
 return loaded.get(entry.id);
}
export function drawNativeAtlas(ctx,atlas,{width,height,angle=0,time=0,reducedMotion=false}){
 const circle=Math.PI*2,frame=Math.round(((angle%circle+circle)%circle)/circle*atlas.frames)%atlas.frames;
 const size=Math.min(width,height),x=(width-size)/2,y=(height-size)/2;
 ctx.clearRect(0,0,width,height);ctx.save();
 const breath=reducedMotion?0:Math.sin(time*1.0)*.006;
 ctx.translate(width/2,y+size*.84);ctx.scale(1+breath,1-breath*.72);ctx.translate(-width/2,-(y+size*.84));
 ctx.drawImage(atlas.image,(frame%atlas.columns)*atlas.cell,Math.floor(frame/atlas.columns)*atlas.cell,atlas.cell,atlas.cell,x,y,size,size);ctx.restore();
}
