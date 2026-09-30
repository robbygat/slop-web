// Mobile and constrained connections get the same cast without a WebGL boot.
export function lightHero({compact=false,coarse=false,saveData=false,effectiveType=''}={}){
 return compact||coarse||saveData||['slow-2g','2g','3g'].includes(effectiveType);
}
export const HERO_CAST=['core','neko','blocky','clicky','gatekeeper','chip','noir'];
export const HERO_SEATS=[
 {x:48,y:43,size:44,tilt:-4},{x:25,y:18,size:22,tilt:-12},
 {x:72,y:18,size:22,tilt:12},{x:87,y:39,size:22,tilt:8},
 {x:81,y:63,size:22,tilt:12},{x:18,y:67,size:22,tilt:-10},
 {x:12,y:38,size:22,tilt:-13},
];
export function swapHeroSeat(order,id){const index=order.indexOf(id);if(index<=0)return order;const next=[...order];[next[0],next[index]]=[next[index],next[0]];return next;}
