// Adapters bind exact audited legacy bundles, never a guessed title or genre.
const legacy = new Map([
  ["https://api.slop.game/storage/v1/object/public/games/voxel-drift-ace-9s5l/1.0.0/index.html", {"mode": "drag", "hint": "Drag or use \u2190 \u2192 to steer"}],
  ["https://api.slop.game/storage/v1/object/public/games/zombie-jump-yodu/1.0.0/index.html", {"mode": "tap", "hint": "Click or press Space to jump"}],
  ["https://api.slop.game/storage/v1/object/public/games/flappy-duck-7prm/1.0.0/index.html", {"mode": "tap", "hint": "Click or press Space to flap"}],
  ["https://api.slop.game/storage/v1/object/public/games/releases/caba3d7eaca11c16b7815af06445744ffc92e3fd85756c4cbe297d7d9248118d/shear-stack-85048e702bb293254ebb9bd0f4926638/1.0.0/index.html", {"mode": "tap", "hint": "Click or press Space to stack"}],
  ["https://api.slop.game/storage/v1/object/public/games/skybound-tap-4lko/1.0.0/index.html", {"mode": "aim", "hint": "Point and click \u00b7 arrows aim, Space taps"}],
  ["https://api.slop.game/storage/v1/object/public/games/releases/0f3c7a55591bdfbd294937b0d70f81af2ab8d0818555a4da8b50046ee6e5600e/slipstream-sprint-8d68b0ced81d552804f6cc4bdcd4b7d1/1.0.0/index.html", {"mode": "drag", "hint": "Drag or hold arrow keys to steer"}],
  ["https://api.slop.game/storage/v1/object/public/games/surfy-sub-d6zs/1.0.0/index.html", {"mode": "swipe", "hint": "Drag to swipe \u00b7 arrows move, Space jumps"}],
]);
export const legacyControlSpec = url => legacy.get(url) || null;

// These originals already paint their own aiming reticle. Do not hide the
// cursor for guessed genres or future releases whose controls may differ.
const paintedCursor = new Map([
 ['https://api.slop.game/storage/v1/object/public/games/releases/b63e8ee36d570cd184982fa331f7b62a47eff1e4b63a9ec22c044a164c8e5637/sloppy-zombies-desktop/1.0.0/index.html','canvas{cursor:none!important}'],
 ['https://api.slop.game/storage/v1/object/public/games/releases/85916f9d9b3f4c1cc46428de52a703ba6f9987dce543b7e2a11d768817ffa4d6/slopcraft-desktop/1.0.0/index.html','#stage:has(>#overlay.hidden) canvas{cursor:none!important}'],
]);
export const auditedCursorStyle = url => paintedCursor.get(url) || '';

// Serialized into the opaque game frame. This only supplies the pointer actions
// proven by the listed bundles. New games keep their authored keyboard handlers.
export function installLegacyKeyboard(spec, target = window) {
  if (!spec || !['tap','drag','aim','swipe'].includes(spec.mode)) return;
  const doc = target.document, keys = new Set(), virtualId = 2147483000;
  let paused = false, held = false, x = .5, y = .5, raf = 0, last = 0, cursor;
  const editable = el => el?.closest?.('input,textarea,select,button,a,[contenteditable="true"]');
  const fine = () => target.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const canvas = () => [...doc.querySelectorAll('canvas')].filter(c => c.clientWidth && c.clientHeight && target.getComputedStyle(c).pointerEvents !== 'none').sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];
  const keyboardFocus = () => { const c=canvas();if(c&&!c.hasAttribute('tabindex')){c.setAttribute('tabindex','0');if(!c.hasAttribute('aria-label'))c.setAttribute('aria-label','Game controls');} };
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',keyboardFocus,{once:true});else keyboardFocus();
  const capture = target.Element.prototype.setPointerCapture;
  target.Element.prototype.setPointerCapture = function(id) { if (id !== virtualId) return capture.call(this,id); };
  function point(type, px=x, py=y) {
    const c=canvas(); if (!c) return;
    const r=c.getBoundingClientRect();
    c.dispatchEvent(new target.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:virtualId,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:r.left+px*r.width,clientY:r.top+py*r.height}));
  }
  function mark() {
    if (spec.mode!=='aim') return;
    const c=canvas();if(!c)return;
    if (!cursor) { cursor=doc.createElement('div');cursor.setAttribute('aria-hidden','true');cursor.style.cssText='position:fixed;pointer-events:none;z-index:2147483001;width:22px;height:22px;border:2px solid white;border-radius:50%;box-shadow:0 0 0 2px #252035;transform:translate(-50%,-50%)';doc.body.appendChild(cursor); }
    const r=c.getBoundingClientRect();cursor.style.left=(r.left+x*r.width)+'px';cursor.style.top=(r.top+y*r.height)+'px';cursor.hidden=false;
  }
  function release() {keys.clear();if(held)point('pointerup');held=false;last=0;if(raf)target.cancelAnimationFrame(raf);raf=0;if(cursor)cursor.hidden=true;}
  function tick(now) {
    raf=0;if(paused||!keys.size)return;
    const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;
    x=Math.max(.025,Math.min(.975,x+((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*.9));
    if(spec.mode==='aim')y=Math.max(.025,Math.min(.975,y+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt*.9));
    if(spec.mode==='drag')point('pointermove');else mark();
    raf=target.requestAnimationFrame(tick);
  }
  target.addEventListener('keydown',e=>{
    if(!e.isTrusted||e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||paused||!fine()||editable(e.target))return;
    const key=e.code==='Space'?'Space':e.key, arrow=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key);
    if(key!=='Space'&&!arrow)return;if(spec.mode==='tap'&&key!=='Space')return;
    e.preventDefault();if(e.repeat)return;
    if(spec.mode==='tap'||(spec.mode==='aim'&&key==='Space')){point('pointerdown');point('pointerup');return;}
    if(spec.mode==='swipe'){
      point('pointerdown',.5,.5);
      if(arrow)point('pointermove',.5+(key==='ArrowRight'?.22:key==='ArrowLeft'?-.22:0),.5+(key==='ArrowDown'?.22:key==='ArrowUp'?-.22:0));
      point('pointerup',.5+(key==='ArrowRight'?.22:key==='ArrowLeft'?-.22:0),.5+(key==='ArrowDown'?.22:key==='ArrowUp'?-.22:0));return;
    }
    keys.add(key);if(spec.mode==='drag'&&!held){held=true;point('pointerdown');}if(!raf)raf=target.requestAnimationFrame(tick);
  });
  target.addEventListener('keyup',e=>{const key=e.code==='Space'?'Space':e.key;if(!keys.has(key))return;e.preventDefault();keys.delete(key);if(!keys.size)release();});
  target.addEventListener('blur',release);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)release();});
  target.addEventListener('pointerdown',e=>{if(e.isTrusted)release();},true);
  target.addEventListener('message',e=>{if(e.source!==target.parent||typeof e.data!=='string'||e.data.length>4096)return;let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='pause'){paused=true;release();}else if(m.type==='resume')paused=false;});
}
