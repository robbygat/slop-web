// Public discovery only: short-lived, bounded, and never used for owner data.
// Re-entering Explore can reuse the last page instead of flashing a blank gallery.
export function createPublicPageCache({ttl=45000,limit=24,now=Date.now}={}) {
 const pages=new Map();
 return {
  read(key,load){
   const previous=pages.get(key);
   if(previous&&(previous.pending||now()<previous.expires))return previous.promise;
   pages.delete(key);
   const entry={pending:true,expires:0,promise:null};
   entry.promise=Promise.resolve().then(load).then(value=>{
    entry.pending=false;entry.expires=now()+ttl;return value;
   },error=>{if(pages.get(key)===entry)pages.delete(key);throw error;});
   pages.set(key,entry);
   while(pages.size>limit)pages.delete(pages.keys().next().value);
   return entry.promise;
  },
 };
}
