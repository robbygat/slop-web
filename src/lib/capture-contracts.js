import {canonicalGameTarget} from './game-target-contract.js';
export function captureDimensions(width, height, target=null) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 960 || height > 960) throw new Error('Captured frame exceeds the size limit.');
  // Stable canonical sizes keep the shared native/web receipt contract exact.
  // The source is letterboxed, never stretched or cropped, into its orientation.
  // Anything that plays on phones is shown in the app's 9:16 cards, so it gets
  // a 9:16 clip; only desktop-only games are landscape.
  if(target){const value=canonicalGameTarget(target);if(value==='mobile'||value==='cross-platform')return {width:360,height:640};if(value==='desktop')return {width:640,height:360};}
  return width === height ? {width:640,height:640} : width > height ? {width:640,height:360} : {width:360,height:640};
}
export function validCaptureDimensions(width, height) {
  return width===360&&height===640||width===640&&(height===360||height===640);
}
export function validCaptureDimensionsForTarget(width,height,target){
 if(!validCaptureDimensions(width,height))return false;
 const value=canonicalGameTarget(target);return value==='desktop'?width===640&&height===360:width===360&&height===640;
}
// The player shape used while recording, so frames are captured full-bleed in
// the clip's own aspect (the app lays games out at 360x640 for its clips).
export function captureStageAspect(target){
 return canonicalGameTarget(target,{fallback:'mobile'})==='desktop'?16/9:9/16;
}
