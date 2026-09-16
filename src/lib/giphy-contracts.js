const media=/^https:\/\/(?:api\.slop\.game|yqlolbebqfsodqgjlbeh\.supabase\.co)\/functions\/v1\/gif-proxy\/media\/[0-9a-f]{64}$/;

export function safeGifUrl(value){return typeof value==='string'&&value.length<300&&media.test(value)?value:null;}

export function parseGifResults(payload){
 if(!payload||!Array.isArray(payload.gifs)||payload.gifs.length>12)return [];
 return payload.gifs.flatMap(item=>{
  const url=safeGifUrl(item?.url),preview=safeGifUrl(item?.preview_url),width=Number(item?.width),height=Number(item?.height);
  return url&&preview&&Number.isInteger(width)&&width>0&&width<=720&&Number.isInteger(height)&&height>0&&height<=720?[{id:String(item.id||'').slice(0,80),url,preview,width,height}]:[];
 });
}
