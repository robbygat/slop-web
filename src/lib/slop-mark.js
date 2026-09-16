// Resting body geometry from Flutter's slopFormOutlineFor (phase 0, round 0,
// orientation 0). Matching angular samples preserve the native morph anchors.
export const markBodies=['classic','cloud','ghost','wide','star','droplet'];
export const markHold=2400,markTransition=1500;
const count=128,center=[16,16.5],radius=12.5;
const point=(body,i)=>{
 const a=i*Math.PI*2/count,dx=Math.cos(a),dy=Math.sin(a);
 const radial=(lobes,depth)=>1-depth*(1+Math.cos(lobes*(a+Math.PI/2)+Math.PI))/2;
 const r=body==='classic'?radial(5,.14):body==='cloud'?radial(6,.17):body==='star'?radial(10,.14):body==='wide'?1-.28*(1+Math.cos(4*a))/2:1;
 const breath=1+.009*Math.sin(a*3),exponent=body==='droplet'?.66:1;
 let x=Math.sign(dx)*Math.pow(Math.abs(dx),exponent)*radius*r*breath;
 let y=Math.sign(dy)*Math.pow(Math.abs(dy),exponent)*radius*r*breath;
 if(body==='cloud')y*=.84;
 if(body==='ghost'){
  x=dx*25*.46*(1+.06*dy);
  y=dy*radius*(dy>0?.74+.13*Math.cos(dx*Math.PI*3):1);
 }
 return [center[0]+x,center[1]+y];
};
const bodies=Object.fromEntries(markBodies.map(body=>[body,Array.from({length:count},(_,i)=>point(body,i))]));
const pair=p=>p.map(v=>v.toFixed(5)).join(' '),middle=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
export function markOutline(points){
 return 'M'+pair(middle(points.at(-1),points[0]))+points.map((p,i)=>'Q'+pair(p)+' '+pair(middle(p,points[(i+1)%count]))).join('')+'Z';
}
export const restingMark=markOutline(bodies.classic);
export function markFrame(elapsed){
 const beatLength=markHold+markTransition;
 const time=Math.max(0,elapsed),beat=Math.floor(time/beatLength)%markBodies.length,local=time%beatLength;
 const from=markBodies[beat],to=markBodies[(beat+1)%markBodies.length];
 const t=Math.max(0,(local-markHold)/markTransition),blend=t*t*t*(t*(t*6-15)+10);
 const points=bodies[from].map((p,i)=>p.map((v,axis)=>v+(bodies[to][i][axis]-v)*blend));
 return {outline:markOutline(points),from,to,blend,holdFor:Math.max(0,markHold-local)};
}
