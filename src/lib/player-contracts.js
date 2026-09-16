import {trustedEntry} from './contracts.js';
import {validRestartAck} from './player-restart.js';
export function gamePolicy(base){
 if(!trustedEntry(base+'index.html',{preview:base.includes('/game-bundle/preview/')}))throw new Error('This game URL is not trusted.');
 return ["default-src 'none'",`script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${base} https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`,`style-src 'unsafe-inline' ${base}`,`img-src ${base} data: blob:`,`media-src ${base} data: blob:`,`font-src ${base} data:`,`connect-src ${base} blob:`,`worker-src ${base} blob:`,`manifest-src ${base}`,"object-src 'none'","frame-src 'none'","form-action 'none'",`base-uri ${base}`].join('; ');
}
export function acceptPlayerEvent(source,frame,data){
 if(!frame || source!==frame || typeof data!=='string' || data.length>750000)return null;
 if(data==='slop-player-loaded-v1')return {type:'loaded'};
 try {const event=JSON.parse(data);if(!event||Array.isArray(event)||typeof event!=='object')return null;
 const types=['restart-ack','ready','score','finished','gameOver','over','loadError','webGameError','webCaptureResult','webCaptureError','webInteraction','webScroll','webEscape'];
 if(!types.includes(event.type))return null;
 if(event.type==='restart-ack'&&!validRestartAck(event))return null;
 if(event.type==='webScroll'&&(!Number.isFinite(event.deltaY)||Math.abs(event.deltaY)>240||![0,1,2].includes(event.deltaMode)))return null;
 if(event.type==='score'&&(!Number.isSafeInteger(event.value??event.score)||(event.value??event.score)<0))return null;
 if(['finished','gameOver','over'].includes(event.type)&&(event.score??event.value)!=null&&(!Number.isSafeInteger(event.score??event.value)||(event.score??event.value)<0||(event.score??event.value)>=100000000))return null;
 if(event.type==='webCaptureResult'&&(typeof event.request!=='string'||event.request.length<1||event.request.length>120||!/^data:image\/jpeg;base64,\/9j\//.test(event.data)||event.data.length>700000||!Number.isInteger(event.width)||!Number.isInteger(event.height)||event.width<1||event.height<1||event.width>960||event.height>960))return null;
 return event;}catch{return null;}
}
