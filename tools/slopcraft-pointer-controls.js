// First-person input for the curated June Slopcraft release. The browser owns
// pointer lock; embedded browsers that decline it get explicit captured drag.
export function installSlopcraftPointerControls({canvas,stage,overlay,onLook,onBreak,onPlace,onActive,onRelease=()=>{},isPaused=()=>false}){
 const doc=canvas.ownerDocument,win=doc.defaultView;
 const crosshair=stage.querySelector('.crosshair');
 const hint=doc.createElement('div');
 hint.textContent='Drag to look · click to break · right-click to place · Esc to pause';
 hint.style.cssText='display:none;position:absolute;left:12px;right:12px;top:12px;z-index:8;text-align:center;font:12px Nunito,sans-serif;color:white;text-shadow:0 1px 4px #000;pointer-events:none';
 stage.appendChild(hint);
 canvas.tabIndex=0;canvas.style.outline='none';canvas.style.touchAction='none';
 let mode='paused',attempt=0,pending=false,timer=null,drag=null;
 const originalCursor=canvas.style.cursor;
 function cancelDrag(){const previous=drag;drag=null;if(previous&&canvas.hasPointerCapture?.(previous.id))canvas.releasePointerCapture(previous.id);}
 function setMode(value){
  mode=value;stage.dataset.slopLook=value;
  const active=value==='locked'||value==='drag';
  onActive(active);overlay.classList.toggle('hidden',active);
  canvas.style.cursor=active?'none':originalCursor;
  if(crosshair)crosshair.style.display=active?'':'none';
  hint.style.display=value==='drag'?'block':'none';
 }
 function clearPending(){pending=false;win.clearTimeout(timer);timer=null;}
 function leave(){
  attempt++;clearPending();cancelDrag();setMode('paused');onRelease();
  if(doc.pointerLockElement===canvas)doc.exitPointerLock();
 }
 function fallback(ticket){
  if(ticket!==attempt||!pending||isPaused()||doc.hidden||!canvas.isConnected)return;
  clearPending();setMode('drag');
 }
 function begin(){
  if(isPaused()||pending)return;
  cancelDrag();const ticket=++attempt;pending=true;
  canvas.focus({preventScroll:true});
  if(!canvas.requestPointerLock){fallback(ticket);return;}
  // This request remains synchronous with the user's click: no promise or
  // iframe message is allowed to consume the activation before the request.
  try{
   const request=canvas.requestPointerLock();
   request?.catch(()=>fallback(ticket));
   timer=win.setTimeout(()=>fallback(ticket),1200);
  }catch{fallback(ticket);}
 }
 overlay.addEventListener('click',begin);
 doc.addEventListener('pointerlockerror',()=>fallback(attempt));
 doc.addEventListener('pointerlockchange',()=>{
  if(doc.pointerLockElement===canvas){
   if(!pending||isPaused()||doc.hidden){doc.exitPointerLock();return;}
   clearPending();cancelDrag();setMode('locked');
  }else if(mode==='locked')leave();
 });
 doc.addEventListener('mousemove',e=>{if(mode==='locked')onLook(e.movementX,e.movementY);});
 canvas.addEventListener('pointerdown',e=>{
  if(mode!=='locked'&&mode!=='drag')return;
  canvas.focus({preventScroll:true});
  if(e.button===2){e.preventDefault();onPlace();return;}
  if(e.button!==0)return;e.preventDefault();
  if(mode==='locked'){onBreak();return;}
  cancelDrag();drag={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};
  canvas.setPointerCapture?.(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(mode!=='drag'||drag?.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  drag.x=e.clientX;drag.y=e.clientY;drag.distance+=Math.hypot(dx,dy);
  onLook(dx,dy);
 });
 canvas.addEventListener('pointerup',e=>{
  if(drag?.id!==e.pointerId||e.button!==0)return;
  const mine=mode==='drag'&&drag.distance<5;
  cancelDrag();if(mine)onBreak();
 });
 canvas.addEventListener('pointercancel',cancelDrag);
 canvas.addEventListener('lostpointercapture',()=>{drag=null;});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 win.addEventListener('keydown',e=>{if(e.code==='Escape'&&(mode!=='paused'||pending))leave();});
 win.addEventListener('blur',leave);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)leave();});
 setMode('paused');
 return {leave};
}
