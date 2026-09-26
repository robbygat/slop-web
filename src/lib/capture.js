import {captureDimensions} from './capture-contracts.js';
import {requireAnimatedGif} from './gif-contracts.js';
async function decodeFrame(data){
 if(!/^data:image\/jpeg;base64,\/9j\//.test(data)||data.length>700000)throw new Error('Invalid captured frame.');
 const decoded=atob(data.slice(data.indexOf(',')+1));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
 try{captureDimensions(bitmap.width,bitmap.height);}catch(error){bitmap.close();throw error;}return bitmap;
}
// Untrusted game frames may only choose an opaque computed rgb()/rgba() color.
export function captureBackground(value){
 const match=typeof value==='string'&&/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/.exec(value);
 if(!match||[1,2,3].some(i=>Number(match[i])>255)||(match[4]!==undefined&&Number(match[4])<1))return '#101215';
 return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
}
function canvasFor(bitmap,width,height,background='#101215'){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
 const scale=Math.min(width/bitmap.width,height/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(width-w)/2,(height-h)/2,w,h);return canvas;
}
export function visibleFrameChange(before,after){
 if(!(before instanceof Uint8ClampedArray)||!(after instanceof Uint8ClampedArray)||before.length!==after.length||before.length<4)return false;
 let changed=0,samples=0;const stride=Math.max(4,Math.floor(before.length/160000/4)*4);
 for(let i=0;i<before.length;i+=stride){samples++;if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>=30)changed++;}
 return changed>=Math.max(12,Math.ceil(samples*.001));
}
export async function encodeCapture(frames,target=null,{background}={}){
 const fill=captureBackground(background);
 if(frames.length<3||frames.length>40)throw new Error('Record at least three gameplay frames.');
 if(new Set(frames).size<2)throw new Error('Play until something moves, then record the gameplay GIF again.');
 const {GIFEncoder,quantize,applyPalette}=await import('gifenc');let width,height,coverCanvas,reference,moving=false;const gif=GIFEncoder();
 for(let index=0;index<frames.length;index++){
  const bitmap=await decodeFrame(frames[index]);
  try{
   if(index===0){({width,height}=captureDimensions(bitmap.width,bitmap.height,target));coverCanvas=canvasFor(bitmap,width*2,height*2,fill);}
   const canvas=canvasFor(bitmap,width,height,fill),rgba=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
   if(reference)moving ||= visibleFrameChange(reference,rgba);else reference=new Uint8ClampedArray(rgba);
   const palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),width,height,{palette,delay:200});
  }finally{bitmap.close();}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(!moving)throw new Error('The captured canvas did not visibly move. Play the game while recording, then try again.');
 gif.finish();const bytes=gif.bytes();if(bytes.length>2*1024*1024)throw new Error('The gameplay clip is too large. Try recording a quieter moment.');requireAnimatedGif(bytes,frames.length);
 const cover=await new Promise(resolve=>coverCanvas.toBlob(resolve,'image/jpeg',.82));if(!cover||cover.size>700*1024)throw new Error('The cover is too large. Try another capture.');
 return {gif:bytes,cover:new Uint8Array(await cover.arrayBuffer()),frameCount:frames.length,width,height};
}
