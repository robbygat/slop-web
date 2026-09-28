// In-browser feed video capture for the website publish flows. While the
// owner plays, frames of the game canvas (ImageBitmaps transferred out of
// the sandboxed frame) are drawn into the canonical 720x1280 (desktop
// 1280x720) stage and encoded with the browser's hardware H.264 encoder,
// keeping only the last few seconds. Publishing muxes the newest window that
// starts on a keyframe into a faststart MP4 plus a poster JPEG, the same
// contract the server recorder produces. Where WebCodecs H.264 is missing the
// capture reports unsupported and the server video pass records the game.
import {Muxer,ArrayBufferTarget} from 'mp4-muxer';

export const VIDEO_FPS=30;
const KEY_EVERY=VIDEO_FPS; // one keyframe per second
const KEEP_US=10_000_000, WANT_US=7_000_000, MIN_US=3_000_000;

export function videoSize(target){return target==='desktop'?[1280,720]:[720,1280];}

async function supportedConfig(width,height){
 if(typeof VideoEncoder!=='function'||typeof OffscreenCanvas!=='function'||typeof VideoFrame!=='function')return null;
 for(const codec of ['avc1.640028','avc1.4d0028','avc1.42e028']){
  const config={codec,width,height,bitrate:2_400_000,framerate:VIDEO_FPS,avc:{format:'avc'},latencyMode:'quality'};
  try{if((await VideoEncoder.isConfigSupported(config)).supported)return config;}catch{}
 }
 return null;
}

// requestFrame(): Promise<{bitmap:ImageBitmap,background:string|null}|null>
export async function createVideoCapture({target='mobile',requestFrame}){
 const [W,H]=videoSize(target);
 const config=await supportedConfig(W,H);
 if(!config)return {supported:false,start(){},stop(){},async finish(){return null;},close(){}};
 const stage=new OffscreenCanvas(W,H),ctx=stage.getContext('2d');
 let chunks=[],decoderConfig=null,frames=0,running=false,closed=false,loop=null,origin=null,failed=false;
 const posters=new Map();
 const encoder=new VideoEncoder({
  output(chunk,meta){
   if(meta?.decoderConfig)decoderConfig=meta.decoderConfig;
   const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
   chunks.push({data,type:chunk.type,timestamp:chunk.timestamp,duration:chunk.duration??Math.round(1e6/VIDEO_FPS)});
   const newest=chunk.timestamp;
   // Drop whole GOPs older than the window.
   while(chunks.length){const k=chunks.findIndex((c,i)=>i>0&&c.type==='key');if(k<0||newest-chunks[k].timestamp<KEEP_US)break;chunks=chunks.slice(k);}
   for(const t of posters.keys())if(newest-t>KEEP_US+1e6)posters.delete(t);
  },
  error(){failed=true;},
 });
 encoder.configure(config);
 function draw(bitmap,background){
  ctx.fillStyle=background||'#101215';ctx.fillRect(0,0,W,H);
  // Full-bleed like the feed card: cover the canonical stage.
  const scale=Math.max(W/bitmap.width,H/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
  ctx.drawImage(bitmap,(W-w)/2,(H-h)/2,w,h);
 }
 async function tick(){
  while(running&&!closed&&!failed){
   const started=performance.now();
   let frame=null;try{frame=await requestFrame();}catch{}
   if(!running||closed)frame?.bitmap?.close?.();
   if(frame?.bitmap&&running&&!closed){
    draw(frame.bitmap,frame.background);frame.bitmap.close?.();
    const now=performance.now();origin??=now;
    const timestamp=Math.round((now-origin)*1000);
    const key=frames%KEY_EVERY===0;
    const video=new VideoFrame(stage,{timestamp,duration:Math.round(1e6/VIDEO_FPS)});
    if(encoder.encodeQueueSize<8)encoder.encode(video,{keyFrame:key});
    video.close();
    if(key)stage.convertToBlob({type:'image/jpeg',quality:.86}).then(b=>posters.set(timestamp,b)).catch(()=>{});
    frames++;
   }
   const wait=Math.max(0,1000/VIDEO_FPS-(performance.now()-started));
   await new Promise(r=>setTimeout(r,wait));
  }
 }
 return {
  supported:true,
  start(){if(running||closed)return;running=true;loop=tick();},
  async stop(){running=false;await loop;},
  // The newest keyframe-aligned window of about seven seconds, or null.
  async finish(){
   running=false;await loop;if(failed||closed)return null;
   try{await encoder.flush();}catch{return null;}
   if(!decoderConfig||!chunks.length)return null;
   const last=chunks.at(-1),end=last.timestamp+last.duration;
   const keys=chunks.map((c,i)=>c.type==='key'?i:-1).filter(i=>i>=0);
   let startIndex=keys.find(i=>end-chunks[i].timestamp<=WANT_US+500_000)??keys.at(-1);
   if(end-chunks[startIndex].timestamp<MIN_US){const earlier=keys.filter(i=>i<startIndex).at(-1);if(earlier!=null)startIndex=earlier;}
   const picked=chunks.slice(startIndex),base=picked[0].timestamp;
   if(end-base<MIN_US||end-base>15_000_000)return null;
   const muxer=new Muxer({target:new ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:VIDEO_FPS},fastStart:'in-memory',firstTimestampBehavior:'offset'});
   picked.forEach((c,i)=>muxer.addVideoChunkRaw(c.data,c.type,c.timestamp-base,c.duration,i===0?{decoderConfig}:undefined));
   muxer.finalize();
   const video=new Uint8Array(muxer.target.buffer);
   let poster=posters.get(picked[0].timestamp);
   if(!poster){const nearest=[...posters.keys()].sort((a,b)=>Math.abs(a-base)-Math.abs(b-base))[0];poster=posters.get(nearest);}
   if(!poster)return null;
   return {video,poster:new Uint8Array(await poster.arrayBuffer()),width:W,height:H,durationMs:Math.round((end-base)/1000)};
  },
  close(){closed=true;running=false;try{encoder.close();}catch{}},
 };
}

// Uploads a finished clip for the owner's just-published game through
// slop-mcp's owner route (validated server side, stored content-addressed).
export async function uploadPreviewVideo({gameId,clip,accessToken,base='https://api.slop.game/functions/v1/slop-mcp'}){
 if(!clip||!/^[0-9a-f-]{36}$/.test(gameId||'')||!accessToken)return false;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',clip.video));
 const key=[...digest].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
 const send=(query,body,type)=>fetch(`${base}/videos/${gameId}/media?${new URLSearchParams(query)}`,{method:'POST',redirect:'error',credentials:'omit',headers:{authorization:`Bearer ${accessToken}`,'content-type':type},body}).then(r=>r.json().catch(()=>null).then(b=>({ok:r.ok,body:b})));
 const poster=await send({kind:'poster',key},clip.poster,'image/jpeg');
 if(!poster.ok)return false;
 const video=await send({kind:'video',key,poster_bytes:String(clip.poster.length)},clip.video,'video/mp4');
 return video.ok&&video.body?.ok===true;
}
