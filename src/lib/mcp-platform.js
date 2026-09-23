const TARGETS=new Set(['mobile','desktop','cross-platform']);
function htmlTarget(source){
 if(typeof source!=='string')return null;
 const matches=[];for(const tag of source.replace(/<!--[\s\S]*?(?:-->|$)/g,'').matchAll(/<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)){const attributes=new Map();for(const attr of tag[1].matchAll(/([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)){const key=attr[1].toLowerCase();if(!attributes.has(key))attributes.set(key,attr[2]??attr[3]??attr[4]);}if(attributes.get('name')?.toLowerCase()==='slop-target')matches.push(attributes.get('content'));}
 return matches.length===1&&TARGETS.has(matches[0])?matches[0]:null;
}
export function mcpTargetFromFiles(files){
 const source=files?.['slop-platform.json'];if(source==null)return 'mobile';
 let metadata;try{metadata=JSON.parse(source);}catch{throw new Error('The game has invalid platform metadata. Ask your coding app to send a new revision.');}
 if(!metadata||Array.isArray(metadata)||typeof metadata!=='object'||Object.keys(metadata).length!==1||!TARGETS.has(metadata.target_platform))throw new Error('The game has invalid platform metadata. Ask your coding app to send a new revision.');
 const fromHtml=htmlTarget(files?.['index.html']);if(fromHtml&&fromHtml!==metadata.target_platform)throw new Error('The game has conflicting platform metadata. Ask your coding app to send a new revision.');return metadata.target_platform;
}
export function mcpCatalogPlatform(target){if(target==='cross-platform')return 'cross-play';if(target==='mobile'||target==='desktop')return target;throw new Error('Choose phone, desktop, or both.');}
export function mcpTargetLabel(target){return ({mobile:'Phone',desktop:'Desktop','cross-platform':'Phone + desktop'})[target]||'Phone';}
