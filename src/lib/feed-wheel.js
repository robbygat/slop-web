// One desktop wheel/trackpad gesture advances one game. Touch keeps native snap.
export function createFeedWheel({move,now=()=>performance.now(),quiet=180,cooldown=550,threshold=36}){
 let last=-Infinity,lastMove=-Infinity,total=0,stepped=false,direction=0;
 return event=>{
  if(event.ctrlKey||Math.abs(event.deltaX||0)>Math.abs(event.deltaY)||!event.deltaY)return false;
  const time=now();
  if(time-last>quiet&&time-lastMove>=cooldown){total=0;stepped=false;direction=0;}
  last=time;event.preventDefault();
  if(stepped)return true;
  const delta=event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?threshold:1),sign=Math.sign(delta);
  if(sign!==direction){total=0;direction=sign;}
  total+=Math.abs(delta);
  if(total>=threshold){stepped=true;lastMove=time;move(sign);}
  return true;
 };
}
