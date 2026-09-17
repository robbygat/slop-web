const TARGETS=new Set(['mobile','desktop','cross-platform']);
export function mcpTargetFromFiles(files){
 const source=files?.['slop-platform.json'];if(source==null)return 'mobile';
 let metadata;try{metadata=JSON.parse(source);}catch{throw new Error('The game has invalid platform metadata. Ask your coding app to send a new revision.');}
 if(!metadata||Array.isArray(metadata)||typeof metadata!=='object'||Object.keys(metadata).length!==1||!TARGETS.has(metadata.target_platform))throw new Error('The game has invalid platform metadata. Ask your coding app to send a new revision.');
 return metadata.target_platform;
}
export function mcpCatalogPlatform(target){if(target==='cross-platform')return 'cross-play';if(target==='mobile'||target==='desktop')return target;throw new Error('Choose phone, desktop, or both.');}
export function mcpTargetLabel(target){return ({mobile:'Phone',desktop:'Desktop','cross-platform':'Phone + desktop'})[target]||'Phone';}
