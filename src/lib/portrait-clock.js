// One frame clock for all visible portraits, with a bounded painting budget.
const entries=new Set();let raf=0,last=0;
function tick(time){raf=0;if(document.hidden)return;if(time-last>1000/18){last=time;const active=[...entries].filter(e=>e.visible).sort((a,b)=>b.priority-a.priority).slice(0,12);for(const entry of active)entry.paint(time/1000);}if([...entries].some(e=>e.visible))raf=requestAnimationFrame(tick);}
function wake(){if(!raf&&!document.hidden&&[...entries].some(e=>e.visible))raf=requestAnimationFrame(tick);}
export function observePortrait(paint){const entry={paint,visible:false,priority:0};entries.add(entry);return {set(visible,priority=0){entry.visible=visible;entry.priority=priority;wake();},dispose(){entries.delete(entry);if(!entries.size){cancelAnimationFrame(raf);raf=0;}}};}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();});
