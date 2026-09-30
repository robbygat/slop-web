// A shared decoder budget. Offscreen tiles never keep playing or retain a slot.
export function createPreviewPool(limit=6) {
  const entries=new Map();let sequence=0;
  function update(){
    const eligible=[...entries.values()].filter(e=>e.visible).sort((a,b)=>b.priority-a.priority||a.order-b.order);
    const chosen=new Set(eligible.slice(0,limit));
    for(const entry of entries.values()){const active=chosen.has(entry);if(entry.active!==active){entry.active=active;entry.notify(active);}}
  }
  return {register(id,notify){const entry={notify,visible:false,priority:0,active:false,order:sequence++};entries.set(id,entry);return {set(visible,priority=0){entry.visible=visible;entry.priority=priority;update();},release(){if(entry.active)entry.notify(false);entries.delete(id);update();}};},get activeCount(){return [...entries.values()].filter(e=>e.active).length;}};
}
export const previewPool=createPreviewPool(4);
