// Animate the equipped expression; never swap the Slop mark for a different face.
export function expressiveFace(spec,time,reaction=0){
 const phase=time+(spec.seed||0)*3;
 return {...spec,mood:reaction>0?'excited':'happy',talk:Math.max(0,Math.sin(phase*2.4))*(reaction>0?.4:.15)};
}
