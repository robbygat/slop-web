// The isolated painter accepts appearance only. Account and game data never cross.
const defaults={designVersion:7,body:'ghost',palette:'tangerine',eyes:'cyclops',eyeColor:'ink',mouth:'smile',hat:'none',pattern:'none',finish:'jelly',aura:'bubbles',accessory:'none',cape:'none',blush:true};
export function nativeCharacterLook(value){
 const look={...defaults};
 if(value&&typeof value==='object')for(const key of Object.keys(defaults)){
  if(key==='designVersion')continue;
  if(key==='blush'){if(typeof value[key]==='boolean')look[key]=value[key];}
  else if(typeof value[key]==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value[key]))look[key]=value[key];
 }
 return look;
}
export function nativeCharacterMessage(look,{reducedMotion=false,paused=false,front=false,autoRotate=false,requestId=0}={}){
 return JSON.stringify({type:'slop.character.render',version:1,look:nativeCharacterLook(look),reducedMotion:!!reducedMotion,paused:!!paused,front:!!front,autoRotate:!!autoRotate,requestId:Number.isSafeInteger(requestId)&&requestId>=0?requestId:0});
}
export function nativeCharacterReady(event,frameWindow){
 if(!frameWindow||event.source!==frameWindow||event.origin!=='null'||typeof event.data!=='string'||event.data.length>100)return false;
 try{const value=JSON.parse(event.data);return value.type==='slop.character.ready'&&value.version===1&&Object.keys(value).length===2;}catch{return false;}
}
export function nativeCharacterPerformance(event,frameWindow){
 if(!frameWindow||event.source!==frameWindow||event.origin!=='null'||typeof event.data!=='string'||event.data.length>200)return null;
 try{const v=JSON.parse(event.data);return v.type==='slop.character.performance'&&v.version===1&&Object.keys(v).length===4&&Number.isFinite(v.fps)&&v.fps>=0&&v.fps<=240&&Number.isInteger(v.frames)&&v.frames>=30&&v.frames<=240?{fps:v.fps,frames:v.frames}:null;}catch{return null;}
}

export function nativeCharacterRendered(event,frameWindow,requestId){
 if(!frameWindow||event.source!==frameWindow||event.origin!=='null'||typeof event.data!=='string'||event.data.length>160)return false;
 try{const v=JSON.parse(event.data);return v.type==='slop.character.rendered'&&v.version===1&&Object.keys(v).length===3&&v.requestId===requestId;}catch{return false;}
}
