// One mounted account's exact unread count. External read receipts supersede an
// older count request, and releasing the account invalidates every pending read.
export function createActivityUnreadStore({load,start=()=>()=>{}}) {
  const initial=()=>({unread:0,loading:true,error:null});
  let snapshot=initial(),epoch=0,revision=0,pending=false,again=false,cleanup=null;
  const listeners=new Set();
  const emit=()=>{for(const listener of listeners)listener();};
  function publish(unread) {
    if(!Number.isSafeInteger(unread)||unread<0)return;
    revision++;snapshot={unread,loading:false,error:null};emit();
  }
  async function refresh() {
    if(!listeners.size)return;
    if(pending){again=true;return;}
    pending=true;const requestEpoch=epoch,requestRevision=++revision;
    try {
      const count=await load();
      if(requestEpoch===epoch&&requestRevision===revision)publish(count);
    } catch(error) {
      if(requestEpoch===epoch&&requestRevision===revision){snapshot={...snapshot,loading:false,error};emit();}
    } finally {
      if(requestEpoch===epoch){pending=false;if(again){again=false;void refresh();}}
    }
  }
  return {
    getSnapshot:()=>snapshot,publish,refresh,beginRead:()=>++revision,
    publishAt(unread,requestRevision){if(requestRevision===revision)publish(unread);},
    subscribe(listener) {
      listeners.add(listener);
      if(listeners.size===1){cleanup=start(refresh);void refresh();}
      return()=>{
        listeners.delete(listener);
        if(!listeners.size){cleanup?.();cleanup=null;epoch++;revision++;pending=false;again=false;snapshot=initial();}
      };
    },
  };
}
