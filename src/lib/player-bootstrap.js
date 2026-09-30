// Platform-owned code, injected before any untrusted game scripts.
(()=>{
 'use strict';
 // Publishing captures WebGL games too. Without a preserved back buffer the
 // browser clears it after compositing and every cover/GIF frame reads black.
 // Like the app's Cover Studio, only private publish playtests pay this cost.
 if(window.__slopPreviewCapture){try{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attributes){if(typeof type==='string'&&/webgl/i.test(type))attributes={...(attributes&&typeof attributes==='object'?attributes:{}),preserveDrawingBuffer:true};return getContext.call(this,type,attributes);};}catch{}}
 const send=value=>parent.postMessage(JSON.stringify(value),'*');
 let frames=0;
 const errors=[];
 let interacted=false;
 let pointerMode=false;
 let keyboardPaused=false;
 const pressedKeys=new Map();
 const physicalCode=/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(?:Left|Right|Up|Down)|Space|Enter|Escape|Tab|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Backspace|Delete|Home|End|PageUp|PageDown|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Enter))$/;
 const editable=target=>target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
 const codeFor=event=>physicalCode.test(event.code)?event.code:event.code==='Space'||event.key==='Space'||event.key===' '?'Space':/^Arrow(?:Left|Right|Up|Down)$/.test(event.key)?event.key:null;
 function focusPlayfield() {
  const active=document.activeElement;
  // Preserve a game's own input, menu or focused playfield. Only its default
  // document focus needs a target so canvas, document and window all get keys.
  if(document.hidden||keyboardPaused||(active&&active!==document.body&&active!==document.documentElement))return;
  const canvas=document.querySelector('[data-slop-playfield] canvas')||document.querySelector('canvas');
  if(!canvas?.focus)return;
  if(!canvas.hasAttribute('tabindex'))canvas.setAttribute('tabindex','-1');
  canvas.focus({preventScroll:true});
 }
 const legacyKeyCode=code=>/^Key[A-Z]$/.test(code)?code.charCodeAt(3):/^Digit[0-9]$/.test(code)?code.charCodeAt(5):({Space:32,Enter:13,Escape:27,Tab:9,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,ShiftLeft:16,ShiftRight:16,ControlLeft:17,ControlRight:17,AltLeft:18,AltRight:18,Backspace:8,Delete:46,Home:36,End:35,PageUp:33,PageDown:34})[code]||0;
 function dispatchKey(type,input,release=false) {
  const keyCode=Number.isInteger(input.keyCode)&&input.keyCode>0&&input.keyCode<=255?input.keyCode:legacyKeyCode(input.code);
  const event=new KeyboardEvent(type,{key:input.key,code:input.code,bubbles:true,cancelable:true,repeat:!!input.repeat,
   shiftKey:!!input.shiftKey,ctrlKey:!!input.ctrlKey,altKey:!!input.altKey,metaKey:!!input.metaKey,location:input.location||0});
  Object.defineProperty(event,'__slopHost',{value:true});
  if(release)Object.defineProperty(event,'__slopRelease',{value:true});
  for(const name of ['keyCode','which']){try{Object.defineProperty(event,name,{value:keyCode});}catch{}}
  const target=input.target&&input.target.isConnected!==false&&typeof input.target.dispatchEvent==='function'?input.target:
   document.activeElement&&typeof document.activeElement.dispatchEvent==='function'?document.activeElement:
   document.body&&typeof document.body.dispatchEvent==='function'?document.body:null;
  if(target)target.dispatchEvent(event);else if(typeof window.dispatchEvent==='function')window.dispatchEvent(event);else if(typeof dispatchEvent==='function')dispatchEvent(event);
 }
 function releaseKeys() {
  const keys=[...pressedKeys.values()];pressedKeys.clear();
  for(const input of keys)dispatchKey('keyup',{...input,repeat:false,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false},true);
 }
 addEventListener('keydown',event=>{
  if((!event.isTrusted&&!event.__slopHost)||event.__slopRelease||editable(event.target))return;
  const code=codeFor(event);if(!code)return;
  if(keyboardPaused||document.hidden){event.preventDefault();event.stopImmediatePropagation?.();return;}
  pressedKeys.set(code,{key:event.key,code,target:event.target,keyCode:event.keyCode,location:event.location,
   shiftKey:!!event.shiftKey,ctrlKey:!!event.ctrlKey,altKey:!!event.altKey,metaKey:!!event.metaKey,origin:event.__slopHost?'host':'native'});
 },true);
 addEventListener('keyup',event=>{const code=codeFor(event);if(code)pressedKeys.delete(code);},true);
 addEventListener('blur',releaseKeys);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseKeys();});
 document.addEventListener('focusin',event=>{if(editable(event.target)||event.target?.closest?.('button,a'))releaseKeys();});
 addEventListener('pointerdown',event=>{if(!pointerMode||!event.isTrusted||document.pointerLockElement||event.target.closest?.('button,input,textarea,a,select'))return;const canvas=event.target.closest?.('canvas')||document.querySelector('[data-slop-playfield] canvas')||document.querySelector('canvas');try{canvas?.requestPointerLock()?.catch?.(()=>send({type:'webPointerError'}));}catch{send({type:'webPointerError'});}});
 document.addEventListener('pointerlockchange',()=>send({type:'webPointerLock',locked:!!document.pointerLockElement}));
 document.addEventListener('pointerlockerror',()=>send({type:'webPointerError'}));
 const input=event=>{if(!interacted&&event.isTrusted){interacted=true;send({type:'webInteraction'});}};
 addEventListener('pointerdown',input,{passive:true});addEventListener('keydown',input,{passive:true});
 addEventListener('keydown',event=>{if((event.isTrusted||event.__slopHost)&&event.key==='Escape'&&!editable(event.target)){event.preventDefault();send({type:'webEscape'});}});
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
  if(value.type==='pause'||value.type==='restart'){keyboardPaused=true;releaseKeys();return;}
  if(value.type==='resume'){keyboardPaused=false;return;}
  if(value.type==='hostFocus'){focusPlayfield();return;}
  if(value.type==='hostReleaseKeys'){releaseKeys();return;}
  if(value.type==='hostPointerMode'&&typeof value.enabled==='boolean'){pointerMode=value.enabled;if(!pointerMode&&document.pointerLockElement)document.exitPointerLock();return;}
  if(value.type==='hostKey'&&typeof value.down==='boolean'){
   const code=typeof value.code==='string'?value.code:['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(value.key)?value.key:null;
   const key=value.key==='Space'?' ':value.key;
   if(!physicalCode.test(code)||code==='Tab'||typeof key!=='string'||!key||key.length>64||/[\u0000-\u001f\u007f]/.test(key)||value.metaKey||(value.ctrlKey&&!/^Control/.test(code))||(value.altKey&&!/^Alt/.test(code)))return;
   if(value.down&&(keyboardPaused||document.hidden||editable(document.activeElement)))return;
   const previous=pressedKeys.get(code);
   if(value.down&&previous&&!value.repeat)return;
   if(!value.down&&!previous)return;
   dispatchKey(value.down?'keydown':'keyup',{...value,key,code,target:previous?.target});return;
  }
  // Publish-time video capture: the playfield canvas as a transferred bitmap.
  if(value.type==='webFrame'&&typeof value.request==='string'&&value.request.length<=64){
   const usable=list=>[...list].filter(c=>c.width>0&&c.height>0&&!c.closest('[data-slop-owned-ui]')).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
   const stage=document.querySelector('[data-slop-playfield]');
   const canvas=(stage&&usable(stage.querySelectorAll('canvas')))||usable(document.querySelectorAll('canvas'));
   let background=null;for(const node of [canvas?.parentElement,document.body,document.documentElement]){const color=node&&getComputedStyle(node).backgroundColor;if(color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'){background=color;break;}}
   const reply=bitmap=>parent.postMessage({type:'webFrameResult',request:value.request,bitmap,background},'*',bitmap?[bitmap]:[]);
   if(!canvas||typeof createImageBitmap!=='function'){reply(null);return;}
   createImageBitmap(canvas).then(reply,()=>reply(null));return;
  }
  if(value.type!=='webCapture' || typeof value.request!=='string')return;
  try {
   // Same choice as the app: the declared playfield first, never SDK-owned UI.
   const usable=list=>[...list].filter(c=>c.width>0&&c.height>0&&!c.closest('[data-slop-owned-ui]')).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
   const stage=document.querySelector('[data-slop-playfield]');
   const canvas=(stage&&usable(stage.querySelectorAll('canvas')))||usable(document.querySelectorAll('canvas'));
   if(!canvas)throw new Error('No game canvas is available to capture yet.');
   const output=document.createElement('canvas');const scale=Math.min(1,960/Math.max(canvas.width,canvas.height));
   output.width=Math.round(canvas.width*scale);output.height=Math.round(canvas.height*scale);
   output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
   const data=output.toDataURL('image/jpeg',.78);
   if(data.length>700000)throw new Error('This captured frame is too large.');
   // Letterbox space is painted in the game's own background (as in the app),
   // not a foreign dark bar baked into every published clip.
   let background=null;for(const node of [canvas.parentElement,document.body,document.documentElement]){const color=node&&getComputedStyle(node).backgroundColor;if(color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'){background=color;break;}}
   send({type:'webCaptureResult',request:value.request,data,width:output.width,height:output.height,frames,errors:[...errors],background});
  }catch(error){send({type:'webCaptureError',request:value.request,message:String(error.message).slice(0,800)});}
 });
})();
