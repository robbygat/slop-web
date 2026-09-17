import {captureDimensions} from './capture-contracts.js';
import {requireAnimatedGif} from './gif-contracts.js';
async function decodeFrame(data){
 if(!/^data:image\/jpeg;base64,\/9j\//.test(data)||data.length>700000)throw new Error('Invalid captured frame.');
 const decoded=atob(data.slice(data.indexOf(',')+1));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
 try{captureDimensions(bitmap.width,bitmap.height);}catch(error){bitmap.close();throw error;}return bitmap;
}
function canvasFor(bitmap,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#101215';ctx.fillRect(0,0,width,height);
 const scale=Math.min(width/bitmap.width,height/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(width-w)/2,(height-h)/2,w,h);return canvas;
}
export async function encodeCapture(frames){
 if(frames.length<3||frames.length>40)throw new Error('Record at least three gameplay frames.');
 if(new Set(frames).size<2)throw new Error('Play until something moves, then record the gameplay GIF again.');
 const {GIFEncoder,quantize,applyPalette}=await import('gifenc');
 const first=await decodeFrame(frames[0]);const {width,height}=captureDimensions(first.width,first.height);let coverCanvas;
 try{coverCanvas=canvasFor(first,width*2,height*2);}finally{first.close();}
 const gif=GIFEncoder();
 for(const frame of frames){const bitmap=await decodeFrame(frame);let canvas;try{canvas=canvasFor(bitmap,width,height);}finally{bitmap.close();}const rgba=canvas.getContext('2d').getImageData(0,0,width,height).data;const palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),width,height,{palette,delay:200});await new Promise(resolve=>setTimeout(resolve,0));}
 gif.finish();const bytes=gif.bytes();if(bytes.length>2*1024*1024)throw new Error('The gameplay clip is too large. Try recording a quieter moment.');requireAnimatedGif(bytes,frames.length);
 const cover=await new Promise(resolve=>coverCanvas.toBlob(resolve,'image/jpeg',.82));if(!cover||cover.size>700*1024)throw new Error('The cover is too large. Try another capture.');
 return {gif:bytes,cover:new Uint8Array(await cover.arrayBuffer()),frameCount:frames.length,width,height};
}
