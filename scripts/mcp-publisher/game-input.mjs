import {createHash} from 'node:crypto';

// These controls are reviewed only for these exact authored control revisions.
// Titles alone never opt an unrelated or newly changed game into a policy.
const BUILDS = Object.freeze({
 'Zoomies': ['zoomies','e5249963504b70bf593ef844c022ba01fd23a7b3818eb3aa62bc8897b82c214c'],
 'Crumble Tanks': ['tanks','133b75c8e59b4bfe95923b48087242ff4ba8f82ea899b29352f14dc81e03553f'],
 'Lily Leap': ['lily','7757fa7b86f5e976d4730c10de5656d10b1a226c283bdfa1ee343a4142551713'],
 'Comet Catcher': ['comet','e173d8757486320fd5e35f14ce3da24c50bfec45e91689eb4fedb1be9116d8cf'],
 'Taiko Bloom': ['taiko','92de4bbd3a3baa3ca97b24dc053ef19068e6fcbca220e4232a8bdb0a0dc7f44e'],
});
export function authoredInputTitle(html){const title=/<title>\s*([^<]+?)\s*<\/title>/i.exec(String(html))?.[1];return Object.hasOwn(BUILDS,title)?title:null;}
export function identifyGameInput(html,source){const title=authoredInputTitle(html);return title&&typeof source==='string'&&createHash('sha256').update(source).digest('hex')===BUILDS[title][1]?BUILDS[title][0]:null;}

// Injected into the isolated game frame. Copy bounded scalar observations;
// never expose renderer/debug objects or call gameplay/state mutation methods.
export function readRecorderGame(target,kind){
 const titles={zoomies:'Zoomies',tanks:'Crumble Tanks',lily:'Lily Leap',comet:'Comet Catcher',taiko:'Taiko Bloom'};
 if(target.document.title.trim()!==titles[kind])return null;
 const api=target.__game;if(!api)return null;
 try{
  const g=kind==='taiko'?api:typeof api.snap==='function'?api.snap():null;
  const finite=(...values)=>values.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e8);
  if(!g||typeof g.state!=='string'||g.state.length>16||!finite(g.score))return null;
  const result={kind,state:g.state,score:g.score};
  if(kind==='zoomies'){
   if(!finite(g.x,g.v,g.yaw,g.pxPerU,g.rank,g.crashes,g.rocketT,g.drift?.dir,g.drift?.tier)||!Array.isArray(g.ahead)||g.ahead.length!==11||!g.ahead.every(x=>finite(x))||typeof g.drift.on!=='boolean')return null;
   return {...result,x:g.x,v:g.v,yaw:g.yaw,pxPerU:g.pxPerU,rank:g.rank,crashes:g.crashes,rocket:g.rocketT>0,drift:{on:g.drift.on,dir:g.drift.dir,tier:g.drift.tier},ahead:g.ahead.slice(),passes:g.passes,boosts:g.driftBoosts,moves:g.input?.steerMoves};
  }
  if(kind==='tanks'){
   if(typeof g.canFire!=='boolean'||!finite(g.hp,g.kills)||typeof api.aim!=='function')return null;
   // aim() only calculates the same ballistic arc shown during a normal pull.
   const aim=g.canFire?api.aim():null;
   if(aim&&(!finite(aim.ang,aim.pow)||aim.ang<.2||aim.ang>1.48||aim.pow<0||aim.pow>1))return null;
   return {...result,canFire:g.canFire,hp:g.hp,kills:g.kills,aim:aim?{angle:aim.ang,power:aim.pow}:null,drags:g.input?.drags};
  }
  if(kind==='lily'){
   if(!finite(g.row,g.chain,g.idle,g.queued,g.next?.predictedX,g.next?.r)||typeof g.hop!=='boolean'||g.next.r<=0)return null;
   return {...result,row:g.row,chain:g.chain,idle:g.idle,queued:g.queued,hop:g.hop,next:{x:g.next.predictedX,r:g.next.r}};
  }
  if(kind==='comet'){
   if(!finite(g.x,g.mouthY,g.fever,g.caught)||!Array.isArray(g.items)||g.items.length>100)return null;
   const items=g.items.map(i=>({x:i.x,y:i.y,speed:i.speed,bad:i.bad}));
   if(items.some(i=>!finite(i.x,i.y,i.speed)||i.speed<=0||typeof i.bad!=='boolean'))return null;
   return {...result,x:g.x,mouthY:g.mouthY,fever:g.fever,caught:g.caught,items};
  }
  if(kind==='taiko'){
   if(typeof g.roll!=='boolean'||!finite(g.hits,g.taps)||!Array.isArray(g.notes)||g.notes.length>64||!Array.isArray(g.targets)||g.targets.length!==2)return null;
   const notes=g.notes.map(n=>({id:n.id,lane:n.lane,eta:n.eta})),targets=g.targets.map(p=>({x:p.x,y:p.y}));
   if(notes.some(n=>!finite(n.id,n.eta)||![0,1].includes(n.lane))||targets.some(p=>!finite(p.x,p.y)))return null;
   return {...result,roll:g.roll,hits:g.hits,taps:g.taps,notes,targets};
  }
 }catch{}
 return null;
}
export function installGameObservation(read,target=window){
 target.addEventListener('message',event=>{
  if(event.source!==target.parent||typeof event.data!=='string'||event.data.length>200)return;
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m?.type!=='slopRecorderObserve'||!Number.isSafeInteger(m.seq)||m.seq<0)return;
  const observation=read(target,m.kind);
  target.parent.postMessage(JSON.stringify({type:'slopRecorderObservation',seq:m.seq,observation}),'*');
 });
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const slew=(from,to,max)=>from+clamp(to-from,-max,max);
export const GAME_WARMUP_FRAMES=Object.freeze({zoomies:45,tanks:30,lily:12,comet:30,taiko:66});
export function createGameInputController(kind,{width,height,fps=30}){
 if(!Object.hasOwn(GAME_WARMUP_FRAMES,kind)||!Number.isFinite(width)||!Number.isFinite(height)||width<100||height<100||fps!==30)throw new TypeError('Invalid game input policy');
 let finger=null,lastDecision=-99,goal=0,gesture=null,nextAction=0,rollLane=0;
 const hitNotes=new Set();
 const point=(x,y)=>({x:clamp(x,1,width-1),y:clamp(y,1,height-1)});
 function end(){if(!finger)return [];finger=null;return [{type:'touchEnd'}];}
 function move(x,y){const p=point(x,y);if(!finger){finger=p;return [{type:'touchStart',...p}];}if(Math.hypot(p.x-finger.x,p.y-finger.y)<.45)return [];finger=p;return [{type:'touchMove',...p}];}
 function tap(x,y){return [...end(),{type:'touchStart',...point(x,y)},{type:'touchEnd'}];}
 return {
  reset(){const events=end();lastDecision=-99;goal=0;gesture=null;nextAction=0;rollLane=0;hitNotes.clear();return events;},
  next(frame,g){
   if(!Number.isInteger(frame)||frame<0)throw new TypeError('Invalid input frame');
   if(!g||g.kind!==kind||!['play','battle'].includes(g.state)){gesture=null;return end();}
   if(kind==='zoomies'){
    // Read the visible bend, then move one held finger gradually. No bot flag.
    if(frame-lastDecision>=4){lastDecision=frame;const ahead=g.ahead.slice(1,5).reduce((a,b)=>a+b,0)/4;
     const line=clamp(-ahead*90,-3.2,3.2),yaw=clamp((line-g.x)*.06,-.3,.3),rate=g.ahead[0]*g.v*(g.rocket?0:.5)+(yaw-g.yaw)*3.2;
     if(g.drift.on){const q=rate/(g.drift.dir*1.75);goal=Math.abs(ahead)<1/400&&g.drift.tier>=1?0:clamp(g.drift.dir*(Math.pow(clamp((q-.05)/1.05,0,1),1/1.3)*1.5-.5),-.85,.85);}
     else goal=clamp(rate/1.75,-.46,.46); // calm racing line; avoid forced drift oscillations
     if(Math.abs(goal)<.035)goal=0;
    }
    const origin=width*.5,range=clamp(g.pxPerU,30,width*.22),wanted=origin+goal*range;
    return move(finger?slew(finger.x,wanted,width*.008):origin,height*.72);
   }
   if(kind==='tanks'){
    if(!gesture&&g.canFire&&g.aim&&frame>=nextAction){gesture={at:frame,angle:g.aim.angle,power:g.aim.power};nextAction=frame+36;}
    if(!gesture)return [];
    const age=frame-gesture.at,start=point(width*.64,height*.6),distance=clamp(gesture.power*160,6,160);
    if(age<5)return []; // notice the new target before starting the pull
    if(age===5)return move(start.x,start.y);
    if(age<28){const t=clamp((age-5)/18,0,1),ease=t*t*(3-2*t),wanted=point(start.x-Math.cos(gesture.angle)*distance*ease,start.y+Math.sin(gesture.angle)*distance*ease);return move(slew(finger.x,wanted.x,width*.025),slew(finger.y,wanted.y,width*.025));} // pull smoothly, then hold the visible aim
    gesture=null;return end();
   }
   if(kind==='lily'){
    if(frame<nextAction||g.hop||g.queued)return [];
    if(Math.abs(g.next.x)>g.next.r*.62)return [];
    nextAction=frame+12;return tap(width*.5,height*.72);
   }
   if(kind==='comet'){
    if(frame-lastDecision>=5){lastDecision=frame;
     const upcoming=g.items.map(i=>({...i,eta:(i.y-g.mouthY)/i.speed}));
     const good=upcoming.filter(i=>!i.bad&&i.eta>-.08).sort((a,b)=>a.eta-b.eta);
     const kept=good.find(i=>Math.abs(i.x-.2-goal)<.3);
     const pick=kept&&(!good[0]||kept.eta-good[0].eta<.45)?kept:good[0];
     const desired=pick?clamp(pick.x-.2,-3.2,3.2):goal;
     const hazards=g.fever>0?[]:upcoming.filter(i=>i.bad&&i.eta>-.25&&i.eta<1.15);
     const choices=[desired,goal,g.x,-3.1,-1.55,0,1.55,3.1].filter(x=>hazards.every(h=>Math.abs(x+.2-h.x)>1.3));
     if(choices.length)goal=choices.sort((a,b)=>(Math.abs(a-desired)+.3*Math.abs(a-goal))-(Math.abs(b-desired)+.3*Math.abs(b-goal)))[0];
    }
    const wanted=width*(.5+goal/10),x=finger?slew(finger.x,wanted,width*.011):width*(.5+g.x/10);
    return move(x,height*.72);
   }
   if(kind==='taiko'){
    if(frame<nextAction)return [];
    if(g.roll){const p=g.targets[rollLane++%2];nextAction=frame+5;return tap(p.x,p.y);}
    const note=g.notes.filter(n=>n.eta<=.075&&n.eta>=-.12&&!hitNotes.has(n.id)).sort((a,b)=>a.eta-b.eta)[0];
    if(!note)return [];hitNotes.add(note.id);if(hitNotes.size>128)hitNotes.delete(hitNotes.values().next().value);
    const p=g.targets[note.lane];nextAction=frame+3;return tap(p.x,p.y);
   }
   return [];
  },
 };
}
export function gameInputProgress(g){if(!g)return null;const out={state:g.state,score:g.score};for(const key of ['x','yaw','rank','crashes','passes','boosts','moves','hp','kills','drags','row','chain','caught','hits','taps'])if(Number.isFinite(g[key]))out[key]=g[key];return out;}

export function continuousGameInput(g){return !!g&&(g.state==='play'||g.kind==='tanks'&&['battle','kill','advance'].includes(g.state));}
