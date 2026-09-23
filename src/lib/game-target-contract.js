const TARGETS=new Set(['mobile','desktop','cross-platform']);

export function canonicalGameTarget(value,{fallback=null}={}){
 const target=value==='cross-play'?'cross-platform':value;
 if(TARGETS.has(target))return target;
 if(fallback!==null)return canonicalGameTarget(fallback);
 throw new Error('Choose phone, desktop, or both.');
}

export function supportedPlatformsForTarget(value){
 const target=canonicalGameTarget(value);
 return target==='cross-platform'?['mobile','desktop']:[target];
}

export function catalogPlatformForTarget(value){
 const target=canonicalGameTarget(value);
 return target==='cross-platform'?'cross-play':target;
}

function htmlTarget(source){
 if(typeof source!=='string')return null;
 const targets=[];
 for(const match of source.replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/<template\b[\s\S]*?<\/template\s*>/gi,'').matchAll(/<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){
  const attributes=new Map();
  for(const attribute of match[1].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){
   const key=attribute[1].toLowerCase();if(!attributes.has(key))attributes.set(key,attribute[2]??attribute[3]??attribute[4]);
  }
  if(attributes.get('name')?.toLowerCase()==='slop-target')targets.push(attributes.get('content'));
 }
 if(!targets.length)return null;
 const unique=[...new Set(targets)];
 if(unique.length!==1||!TARGETS.has(unique[0]))throw new Error('This game has invalid target metadata. Rebuild it before publishing.');
 return unique[0];
}

function fileTarget(source){
 if(source==null)return null;
 let metadata;try{metadata=JSON.parse(source);}catch{throw new Error('This game has invalid target metadata. Rebuild it before publishing.');}
 if(!metadata||Array.isArray(metadata)||typeof metadata!=='object'||Object.keys(metadata).length!==1||!TARGETS.has(metadata.target_platform))throw new Error('This game has invalid target metadata. Rebuild it before publishing.');
 return metadata.target_platform;
}

export function gameTargetFromFiles(files,{fallback='mobile'}={}){
 const fromHtml=htmlTarget(files?.['index.html']),fromFile=fileTarget(files?.['slop-platform.json']);
 if(fromHtml&&fromFile&&fromHtml!==fromFile)throw new Error('This game has conflicting target metadata. Rebuild it before publishing.');
 return fromFile||fromHtml||canonicalGameTarget(fallback);
}

export function previewGameForTarget(value){
 const target=canonicalGameTarget(value),landscape=target==='desktop';
 return {supported_platforms:supportedPlatformsForTarget(target),preview_width:landscape?640:360,preview_height:landscape?360:640,target_platform:target};
}

export function creatorTargetInstruction(value){
 const target=canonicalGameTarget(value);
 const device=target==='mobile'
  ?'Build for a portrait phone viewport. Use touch-first controls and mobile safe areas. Do not require a keyboard or mouse.'
  :target==='desktop'
  ?'Build for a responsive desktop viewport. Use keyboard and mouse controls and keep the complete playfield visible without clipping.'
  :'Build one responsive game for phone and desktop around one shared game state. Provide equivalent touch and keyboard/mouse controls. Keep the portrait phone arena intact and letterbox it on wide screens without stretching or exposing extra play space.';
 return `Slop target: ${target}. Include <meta name="slop-target" content="${target}"> in index.html and keep it unchanged in later revisions. ${device} Keep the platform-owned slop.js unchanged. Use Slop.ready after the first usable rendered frame, Slop.score during play, Slop.finished once at real game over, Slop.onRestart for a complete reset, and Slop.loop/Slop.input so pause, resume, pointer, keyboard and touch work through the shared native/web lifecycle. Draw changing gameplay on the Slop canvas so the website can record a real moving preview.`;
}
