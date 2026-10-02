// Send only validated JSON values. This avoids one giant UTF-16 RPC string
// when a binary-heavy World contains a small amount of Unicode source text.
// Chunk boundaries never bisect a surrogate pair, preserving JSON.stringify's
// exact representation of valid pairs and its escaping of lone surrogates.
function* fragments(value){
 if(typeof value==='string'){
  yield '"';
  for(let offset=0;offset<value.length;){
   let end=Math.min(value.length,offset+8_192);
   if(end<value.length&&value.charCodeAt(end-1)>=0xd800&&value.charCodeAt(end-1)<=0xdbff&&value.charCodeAt(end)>=0xdc00&&value.charCodeAt(end)<=0xdfff)end--;
   yield JSON.stringify(value.slice(offset,end)).slice(1,-1);offset=end;
  }
  yield '"';return;
 }
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)){yield JSON.stringify(value);return;}
 if(Array.isArray(value)){
  yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* fragments(value[i]);}yield ']';return;
 }
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  yield '{';let first=true;for(const key of Object.keys(value)){if(!first)yield ',';first=false;yield JSON.stringify(key);yield ':';yield* fragments(value[key]);}yield '}';return;
 }
 throw new TypeError('validated_json_required');
}
export function jsonBodyStream(value){
 const iterator=fragments(value),encoder=new TextEncoder();
 return new ReadableStream({
  pull(controller){try{const next=iterator.next();if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));}catch(error){controller.error(error);}},
  cancel(){iterator.return();},
 });
}
