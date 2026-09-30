// Pointer type and viewport size affect the render budget, never whether a
// normal phone gets the real 3D cast. Only explicit constraints use the fallback.
export function lightHero({reducedMotion=false,saveData=false,effectiveType=''}={}){
 return reducedMotion||saveData||['slow-2g','2g','3g'].includes(effectiveType);
}

export function heroRenderBudget({width=620,height=500,dpr=1,coarse=false}={}){
 const phone=coarse||width<500;
 const pixels=Math.max(1,width)*Math.max(1,height);
 return {maxFPS:phone?24:30,dprCap:Math.max(.75,Math.min(dpr||1,phone?1.25:1.5,Math.sqrt(850000/pixels))),faceSize:phone?192:256,faceFPS:phone?12:15,particles:phone?100:180};
}

export const HERO_CAST=['core','neko','blocky','clicky','gatekeeper','chip','noir'];
export const HERO_SEATS=[
 {x:48,y:43,size:44,tilt:-4},{x:25,y:18,size:22,tilt:-12},
 {x:72,y:18,size:22,tilt:12},{x:87,y:39,size:22,tilt:8},
 {x:81,y:63,size:22,tilt:12},{x:18,y:67,size:22,tilt:-10},
 {x:12,y:38,size:22,tilt:-13},
];
export function swapHeroSeat(order,id){const index=order.indexOf(id);if(index<=0)return order;const next=[...order];[next[0],next[index]]=[next[index],next[0]];return next;}
