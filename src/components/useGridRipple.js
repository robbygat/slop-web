import {useEffect} from 'react';
import {rippleAt} from '../lib/grid-ripple.js';
export function useGridRipple(ref,resetKey){
 useEffect(()=>{
  const grid=ref.current;if(!grid)return;const motion=matchMedia('(prefers-reduced-motion: reduce)');let tiles=[],frame=0,disposed=false,lastMove=-Infinity,pointer={x:0,y:0},touched=new Set();
  const clear=()=>{cancelAnimationFrame(frame);frame=0;for(const tile of touched){tile.style.removeProperty('--ripple-y');tile.style.removeProperty('--ripple-x');tile.style.removeProperty('--ripple-scale');tile.style.removeProperty('--ripple-turn');tile.style.removeProperty('--ripple-brightness');}touched.clear();};
  const measure=()=>{const origin=grid.getBoundingClientRect();tiles=[...grid.children].map(node=>{const bounds=node.getBoundingClientRect();return {node,x:bounds.left-origin.left+bounds.width/2,y:bounds.top-origin.top+bounds.height/2};});};
  const tick=now=>{frame=0;if(disposed||motion.matches||document.hidden){clear();return;}const age=now-lastMove;if(age>1400){clear();return;}
   for(const tile of tiles){const dx=tile.x-pointer.x,dy=tile.y-pointer.y,d=Math.hypot(dx,dy);if(d>300&&!touched.has(tile.node))continue;const wave=rippleAt(d,age),lift=wave*3,scale=1+Math.max(0,1-d/210)*Math.exp(-age/650)*.018;tile.node.style.setProperty('--ripple-y',`${lift.toFixed(2)}px`);tile.node.style.setProperty('--ripple-x',`${(wave*dx/230).toFixed(2)}px`);tile.node.style.setProperty('--ripple-scale',scale.toFixed(3));tile.node.style.setProperty('--ripple-turn',`${(wave*dx/280).toFixed(2)}deg`);tile.node.style.setProperty('--ripple-brightness',String(1+Math.max(0,wave)*.025));touched.add(tile.node);}
   frame=requestAnimationFrame(tick);
  };
  const move=e=>{if(e.pointerType!=='mouse'||motion.matches)return;const r=grid.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top};lastMove=performance.now();if(!frame)frame=requestAnimationFrame(tick);};
  const enter=()=>measure(),leave=()=>{lastMove=Math.min(lastMove,performance.now()-350);},visibility=()=>{if(document.hidden)clear();};
  const ro=new ResizeObserver(measure);ro.observe(grid);measure();grid.addEventListener('pointermove',move);grid.addEventListener('pointerenter',enter);grid.addEventListener('pointerleave',leave);motion.addEventListener('change',clear);document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;clear();ro.disconnect();grid.removeEventListener('pointermove',move);grid.removeEventListener('pointerenter',enter);grid.removeEventListener('pointerleave',leave);motion.removeEventListener('change',clear);document.removeEventListener('visibilitychange',visibility);};
 },[ref,resetKey]);
}
