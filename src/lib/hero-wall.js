import layout from './hero-wall-layout.json' with {type:'json'};

// Geometry and featured games of the baked wall (tools/build-hero-wall.py).
// Every game appears exactly once; FEATURED are the games that
// lift, each stored with its column, row and loop phase inside the wall video.
export const HERO_WALL=Object.freeze({...layout.wall});
export const HERO_FEATURED=Object.freeze(layout.lifts.map(lift=>Object.freeze({...lift})));
export const HERO_WALL_GAMES=Object.freeze([...layout.games]);
// Shorter than the 5s spacing between featured rows, so each lane catches the next.
export const HERO_LIFT_MS=4600;
const {h:H,cellW,cellH,tileW,tileH,w:W,loop,fps,tileLoop,colOffset}=HERO_WALL;
export const WALL_SPEED=H/loop; // px per second every column travels

const mod=(value,period)=>((value%period)+period)%period;

// Phones decode the 1600px cut; the 2948px cut only where it is needed.
export function wallVideoSource({saveData=false,effectiveType='',narrow=false}={}){
 return narrow||saveData||['slow-2g','2g','3g'].includes(effectiveType)
  ?'/assets/brand/game-wall.mp4':'/assets/brand/game-wall-hd.mp4';
}

// Match FFmpeg's baked crop: nearest 24fps frame, rounded down to an even pixel.
export function wallCrop(col,time){
 const frameTime=Math.round(time*fps)/fps;
 const position=mod(frameTime*WALL_SPEED+col*colOffset,H);
 return 2*Math.floor((position+.5)/2);
}

// Top edge of a tile in wall pixels at media time t (even columns move up).
export const tileY=(col,row,time)=>mod(row*cellH-wallCrop(col,time),H);

// Lifts begin at `start` (fraction of wall height) and must stay whole on the
// wall for the full ride, so the opening never wraps across the loop edge.
export function liftWindow(start){
 const ride=WALL_SPEED*HERO_LIFT_MS/1000,min=Math.ceil(ride)+8,max=H-tileH-8;
 return {y:Math.min(max,Math.max(min,Math.round(start*H))),ride,min,max};
}

// The next featured game to reach the lift line, skipping recently lifted ones.
// Returns the wall-time delay until it arrives.
export function nextLift(time,start,recent=[],col=null){
 const {y}=liftWindow(start);
 let best=null;
 for(const lift of HERO_FEATURED){
  if(recent.includes(lift.id)||(col!==null&&lift.col!==col))continue;
  const exact=mod(lift.row*cellH-mod(time*WALL_SPEED+lift.col*colOffset,H),H);
  const delay=mod(exact-y,H)/WALL_SPEED;
  if(delay<.35)continue;
  if(!best||delay<best.delay)best={lift,delay};
 }
 return best;
}

// Where the lift sits on the plane, and how far it rides, in CSS percentages.
export function liftPlacement(lift,time){
 const y=tileY(lift.col,lift.row,time);
 return {left:lift.col*cellW/W*100,top:y/H*100,width:tileW/W*100,y,
  ridePercent:-WALL_SPEED*HERO_LIFT_MS/1000/tileH*100};
}

// Milliseconds the wall has advanced since `from`, across the loop seam.
export const elapsedMs=(from,to)=>mod(to-from,loop)*1000;

// Loop time the wall tile is showing, so the lifted copy shows the same frame.
export const liftClipTime=(lift,time)=>mod(time+lift.phase,tileLoop);
// Columns that hold featured games; each runs its own independent lift lane.
export const LIFT_COLUMNS=Object.freeze([...new Set(HERO_FEATURED.map(lift=>lift.col))]);

// The soonest featured game inside the visible band [lo, hi] (fractions of wall
// height), so lifts start wherever a featured game happens to be. Skips recent
// games and prefers the other column; `lead` leaves time to seek the clip.
export function nextLiftInBand(time,lo,hi,{recent=[],avoidCol=null,lead=.35}={}){
 const {min,max}=liftWindow(0),top=Math.max(min,lo*H),bottom=Math.min(max,hi*H);
 let best=null;
 for(const lift of HERO_FEATURED){
  if(recent.includes(lift.id))continue;
  const y=mod(lift.row*cellH-mod(time*WALL_SPEED+lift.col*colOffset,H),H);
  const delay=y-WALL_SPEED*lead>=top&&y<=bottom?lead:mod(y-bottom,H)/WALL_SPEED;
  const score=delay+(lift.col===avoidCol?2.5:0);
  if(!best||score<best.score)best={lift,delay,score};
 }
 return best;
}
