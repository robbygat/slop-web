// Fit the same real cast on phones and desktop. The seated mascot lives outside
// this frame, so no empty lower corner needs to be reserved in the 3D scene.
export function heroComposition(width,height){
 const w=Math.max(1,width),h=Math.max(1,height),bottom=0;
 const scale=Math.max(.01,Math.min((w-28)/740,(h-28)/470));
 return {x:w*.48,y:h/2+70*scale,scale,bottom};
}

// The first painted portrait frame uses the same seats as the shared 3D stage.
// Portrait assets have transparent padding around their visible shell.
export function heroPosterLayout(width,height){
 const {x,y,scale}=heroComposition(width,height);
 const seats=[['neko',247],['blocky',293],['chip',339],['noir',25],['gatekeeper',155],['clicky',201]];
 return [{id:'core',x:x/width*100,y:y/height*100,size:284*scale/.8},...seats.map(([id,degrees])=>{
  const angle=degrees*Math.PI/180;
  return {id,x:(x+(22+278*Math.cos(angle))*scale)/width*100,y:(y+(-20+206*Math.sin(angle))*scale)/height*100,size:146*scale/.8};
 })];
}
