// Geometry shared by the baked wall and the lift's captured video frame.
export const HERO_WALL=Object.freeze({w:2948,h:1536,cellW:134,cellH:256,tileW:128,tileH:250,loop:15});
export const HERO_LIFT_MS=5200;

// Screen size does not reduce wall sharpness; only explicit data constraints do.
export function wallVideoSource({saveData=false,effectiveType=''}={}){
 return saveData||['slow-2g','2g','3g'].includes(effectiveType)
  ?'/assets/brand/game-wall.mp4':'/assets/brand/game-wall-hd.mp4';
}

const mod=(value,period)=>((value%period)+period)%period;
// Match the baked 24fps FFmpeg crop: nearest source frame, then nearest pixel
// rounded down to an even coordinate for the video's chroma alignment.
function wallCrop(col,time){
 const frameTime=Math.round(time*24)/24;
 const position=mod(frameTime*HERO_WALL.h/HERO_WALL.loop+col*137,HERO_WALL.h);
 return 2*Math.floor((position+.5)/2);
}

// Even columns travel upward. Pick a complete tile with enough space to remain
// on the wall for the entire lift, nearest the requested fraction of its height.
export function findWallSlot(col,time,start){
 if(!Number.isInteger(col)||col<0||col>=HERO_WALL.w/HERO_WALL.cellW||col%2
  ||!Number.isFinite(time)||!Number.isFinite(start))return null;
 const crop=wallCrop(col,time);
 const ride=HERO_WALL.h/HERO_WALL.loop*HERO_LIFT_MS/1000,min=ride+8,max=HERO_WALL.h-HERO_WALL.tileH-8;
 let best=null;
 for(let row=0;row<HERO_WALL.h/HERO_WALL.cellH;row++){
  const y=mod(row*HERO_WALL.cellH-crop,HERO_WALL.h);
  if(y<min||y>max)continue;
  const distance=Math.abs(y-start*HERO_WALL.h);
  if(!best||distance<best.distance)best={y,distance,row};
 }
 return best?{left:col*HERO_WALL.cellW/HERO_WALL.w*100,top:best.y/HERO_WALL.h*100,col,row:best.row,initialY:best.y}:null;
}

// Follow the same baked tile row in each decoded frame. A slightly earlier
// first frame and a loop seam both resolve directly to their actual wall pixels.
export function sampleWallLift(slot,frameTime,videoWidth,videoHeight){
 const y=mod(slot.row*HERO_WALL.cellH-wallCrop(slot.col,frameTime),HERO_WALL.h);
 return {offsetPercent:(y-slot.initialY)/HERO_WALL.tileH*100,source:{
  x:slot.col*HERO_WALL.cellW/HERO_WALL.w*videoWidth,
  y:y/HERO_WALL.h*videoHeight,
  width:HERO_WALL.tileW/HERO_WALL.w*videoWidth,
  height:HERO_WALL.tileH/HERO_WALL.h*videoHeight,
 }};
}
