// Platform-owned code, injected before any untrusted game scripts.
(()=>{
 'use strict';
 const send=value=>parent.postMessage(JSON.stringify(value),'*');
 let frames=0;
 const errors=[];
 let interacted=false;
 const input=event=>{if(!interacted&&event.isTrusted){interacted=true;send({type:'webInteraction'});}};
 addEventListener('pointerdown',input,{passive:true});addEventListener('keydown',input,{passive:true});
 addEventListener('keydown',event=>{if(event.isTrusted&&event.key==='Escape')send({type:'webEscape'});});
 // A feed can scroll over games that do not consume the wheel themselves.
 // Touch stays with the game; the feed provides a separate swipe/next rail.
 addEventListener('wheel',event=>{queueMicrotask(()=>{if(event.isTrusted&&!event.defaultPrevented&&!event.ctrlKey&&Number.isFinite(event.deltaY))send({type:'webScroll',deltaY:Math.max(-240,Math.min(240,event.deltaY)),deltaMode:event.deltaMode});});},{passive:true});
 addEventListener('error',event=>{const message=String(event.message||'A game asset failed to load').slice(0,800);if(errors.length<12){errors.push(message);send({type:'webGameError',message});}},true);
 addEventListener('unhandledrejection',event=>{const message=String(event.reason?.message||'Game promise failed').slice(0,800);if(errors.length<12){errors.push(message);send({type:'webGameError',message});}});
 // Games do not need navigation, forms, popups or downloads.
 window.open=()=>null;
 addEventListener('click',event=>{if(event.target.closest?.('a[href]'))event.preventDefault();},true);
 addEventListener('submit',event=>event.preventDefault(),true);
 const loop=()=>{frames++;requestAnimationFrame(loop);};requestAnimationFrame(loop);
 addEventListener('message',event=>{
  if(event.source!==parent || typeof event.data!=='string' || event.data.length>4096)return;
  let value;try{value=JSON.parse(event.data);}catch{return;}
  if(value.type==='hostKey'&&typeof value.down==='boolean'&&['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(value.key)){
   const keyEvent=new KeyboardEvent(value.down?'keydown':'keyup',{key:value.key==='Space'?' ':value.key,code:value.key,bubbles:true,cancelable:true});
   Object.defineProperty(keyEvent,'__slopHost',{value:true});dispatchEvent(keyEvent);return;
  }
  if(value.type!=='webCapture' || typeof value.request!=='string')return;
  try {
   const canvas=[...document.querySelectorAll('canvas')].filter(c=>c.width>0&&c.height>0).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
   if(!canvas)throw new Error('No game canvas is available to capture yet.');
   const output=document.createElement('canvas');const scale=Math.min(1,960/Math.max(canvas.width,canvas.height));
   output.width=Math.round(canvas.width*scale);output.height=Math.round(canvas.height*scale);
   output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
   const data=output.toDataURL('image/jpeg',.78);
   if(data.length>700000)throw new Error('This captured frame is too large.');
   send({type:'webCaptureResult',request:value.request,data,width:output.width,height:output.height,frames,errors:[...errors]});
  }catch(error){send({type:'webCaptureError',request:value.request,message:String(error.message).slice(0,800)});}
 });
})();
