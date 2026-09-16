export function createBuildRouteGuard(){
 let version=0,active=false;
 return {
  activate(){active=true;version++;},
  deactivate(){active=false;version++;},
  invalidate(){return ++version;},
  capture(){return version;},
  isCurrent(ticket){return active&&ticket===version;},
  async wait(ticket,work){
   if(!this.isCurrent(ticket))throw new Error('Build view changed.');
   const result=await work();
   if(!this.isCurrent(ticket))throw new Error('Build view changed.');
   return result;
  },
 };
}

// Persist before admission: an uncertain response must retain the same ID.
export function buildTabStorage(){try{return globalThis.sessionStorage;}catch{return null;}}
export async function admitBuildRequest({storage,owner,body,request}){
 try{storage.setItem(`slop.pending-build.${owner}`,JSON.stringify({owner,body}));}
 catch{throw new Error('Your browser couldn’t save this build request. Free some tab storage or enable it, then try again. Your idea is still here; no build was started.');}
 return request(body);
}

export function clearPendingBuild(storage,owner,requestId){
 try{
  const key=`slop.pending-build.${owner}`,saved=JSON.parse(storage.getItem(key));
  if(saved?.owner===owner&&saved.body?.request_id===requestId)storage.removeItem(key);
 }catch{ /* An already admitted request remains safe to reconcile by its ID. */ }
}
