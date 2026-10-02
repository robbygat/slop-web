// Only public browsing choices belong here; game snapshots and account data do not.
export const BROWSE_PREFERENCES_KEY='slop.browse-preferences.v1';
const defaults={platform:'all',order:'newest'};
const browserStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};

export function normalizeBrowsePreferences(value,fallback=defaults){
 const platform=value?.platform==='cross-play'||value?.platform==='cross-platform'?'mobile':value?.platform;
 return {platform:['all','mobile','desktop'].includes(platform)?platform:fallback.platform,order:['newest','popular'].includes(value?.order)?value.order:fallback.order};
}

export function createBrowsePreferencesStore({storage=browserStorage}={}){
 let current={...defaults},lastRaw;
 const getStorage=()=>typeof storage==='function'?storage():storage;
 return {
  read(){
   try{const raw=getStorage()?.getItem(BROWSE_PREFERENCES_KEY);if(raw!=null&&raw!==lastRaw){lastRaw=raw;current=normalizeBrowsePreferences(JSON.parse(raw));}}catch{}
   return {...current};
  },
  write(patch){
   current=normalizeBrowsePreferences(patch,this.read());
   // Keep choices in memory when private browsing or a full disk blocks storage.
   try{const raw=JSON.stringify(current);getStorage()?.setItem(BROWSE_PREFERENCES_KEY,raw);lastRaw=raw;}catch{}
   return {...current};
  },
 };
}
const preferences=createBrowsePreferencesStore();
export const readBrowsePreferences=()=>preferences.read();
export const writeBrowsePreferences=patch=>preferences.write(patch);
