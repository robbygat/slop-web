import layout from './hero-wall-layout.json' with {type:'json'};

// Geometry and featured games of the hero wall (tools/build-hero-wall.py).
// Every game appears exactly once. The wall video is the grid standing still;
// the page scrolls columns on the GPU, one wall height per `loop` seconds, even
// columns up and odd columns down, each offset by col*colOffset.
export const HERO_WALL=Object.freeze({...layout.wall});
export const HERO_FEATURED=Object.freeze(layout.lifts.map(lift=>Object.freeze({...lift})));
export const HERO_WALL_GAMES=Object.freeze([...layout.games]);
export const HERO_LIFT_MS=4600;
const {h:H,cellW,cellH,tileW,tileH,w:W,loop,tileLoop,colOffset}=HERO_WALL;
export const WALL_SPEED=H/loop; // px per second every column travels

const mod=(value,period)=>((value%period)+period)%period;

// Phones and constrained connections get the 1600px cut; codec is chosen by the page.
export function wallVideoStem({saveData=false,effectiveType='',narrow=false}={}){
 return narrow||saveData||['slow-2g','2g','3g'].includes(effectiveType)?'/assets/brand/game-wall':'/assets/brand/game-wall-hd';
}

// Top edge (wall px) of a tile in an upward (even) column at wall clock t.
export const tileY=(col,row,time)=>mod(row*cellH-(time*WALL_SPEED+col*colOffset),H);

// A lift must stay whole on the wall for its full ride (never wraps an edge).
export function liftWindow(){
 const ride=WALL_SPEED*HERO_LIFT_MS/1000;
 return {ride,min:Math.ceil(ride)+8,max:H-tileH-8};
}

// The soonest featured game inside the visible band [lo, hi] (fractions of wall
// height), so lifts start wherever a featured game happens to be. Skips recent
// games and prefers the other column; `lead` leaves time to seek its clip.
export function nextLiftInBand(time,lo,hi,{recent=[],avoidCol=null,lead=.35}={}){
 const {min,max}=liftWindow(),top=Math.max(min,lo*H),bottom=Math.min(max,hi*H);
 let best=null;
 for(const lift of HERO_FEATURED){
  if(recent.includes(lift.id))continue;
  const y=tileY(lift.col,lift.row,time);
  const delay=y-WALL_SPEED*lead>=top&&y<=bottom?lead:mod(y-bottom,H)/WALL_SPEED;
  const score=delay+(lift.col===avoidCol?2.5:0);
  if(!best||score<best.score)best={lift,delay,score};
 }
 return best;
}

// Plane position of a lift (CSS %), from the same clock that drives the shader.
export function liftPlacement(lift,time){
 const y=tileY(lift.col,lift.row,time);
 return {left:lift.col*cellW/W*100,top:y/H*100,width:tileW/W*100,height:tileH/H*100,y};
}

// Loop time the wall video shows for this tile, so the lifted copy matches it.
export const liftClipTime=(lift,videoTime)=>mod(videoTime+lift.phase,tileLoop);
