// Share a bounded number of decoders without starving cards later in the grid.
export function createPreviewPool(limit=6,{interval=6000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const entries=new Map();let sequence=0,timer=null;
  function update(rotate=false){
    if(rotate)for(const entry of entries.values())if(entry.active&&entry.priority===0)entry.order=sequence++;
    const eligible=[...entries.values()].filter(entry=>entry.visible).sort((a,b)=>b.priority-a.priority||a.order-b.order);
    const chosen=new Set(eligible.slice(0,limit)),changes=[];
    for(const entry of entries.values()){
      const active=chosen.has(entry);
      if(entry.active!==active){entry.active=active;changes.push(entry);}
    }
    // Pause old videos before asking new videos to play, including budget changes.
    for(const entry of changes.filter(entry=>!entry.active))entry.notify(false);
    for(const entry of changes.filter(entry=>entry.active))entry.notify(true);
    if(limit>0&&eligible.length>limit){
      if(timer===null){timer=setTimer(()=>{timer=null;update(true);},interval);timer?.unref?.();}
    }else if(timer!==null){clearTimer(timer);timer=null;}
  }
  return {
    register(id,notify){
      const previous=entries.get(id);if(previous?.active)previous.notify(false);
      const entry={notify,visible:false,priority:0,active:false,order:sequence++};entries.set(id,entry);
      return {
        set(visible,priority=0){if(entries.get(id)!==entry)return;entry.visible=visible;entry.priority=priority;update();},
        release(){if(entries.get(id)!==entry)return;entries.delete(id);if(entry.active)entry.notify(false);update();},
      };
    },
    setLimit(value){limit=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;update();},
    get activeCount(){return [...entries.values()].filter(entry=>entry.active).length;},
  };
}
export const previewPool=createPreviewPool(8);
if(typeof matchMedia==='function'){
  const phone=matchMedia('(max-width:900px), (pointer:coarse)'),wide=matchMedia('(min-width:1200px)');
  const update=()=>previewPool.setLimit(phone.matches?2:wide.matches?8:6);
  phone.addEventListener('change',update);wide.addEventListener('change',update);update();
}
