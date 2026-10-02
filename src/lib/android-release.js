// Keep downloads current even when a browser still has an older app shell.
// The bundled release remains usable if the lightweight freshness read fails.
export async function latestAndroidRelease(fallback,fetcher=fetch){
 try{
  const response=await fetcher('/downloads/android-release.json',{cache:'no-store'});
  if(!response.ok)return fallback;
  const value=await response.json();
  if(!Number.isSafeInteger(value?.build)||value.build<fallback.build||
     value.package!=='game.slop.api'||!/^\d+\.\d+\.\d+$/.test(value.version)||
     value.file!==`Slop-${value.version}-build-${value.build}-universal.apk`||
     value.url!==`https://slop.game/downloads/${value.file}`||
     !/^[a-f0-9]{64}$/.test(value.sha256))return fallback;
  return value;
 }catch{return fallback;}
}
