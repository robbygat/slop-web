// The character scene has its own frame, independent of the headline width.
// Reserve a lower corner for the seated body and fit all six orbiting heads.
export function heroComposition(width,height){
 const w=Math.max(1,width),h=Math.max(1,height),bottom=Math.min(145,h*.28);
 const scale=Math.max(.01,Math.min((w-40)/740,(h-bottom-40)/470));
 return {x:w*.48,y:(h-bottom)/2+70*scale,scale,bottom};
}
