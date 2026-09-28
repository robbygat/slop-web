import {createHash} from 'node:crypto';
import {coastLane,roofTarget,crowdTarget,flappyTap,rollerDirection} from './visible-game-plans.mjs';

// These controls are reviewed only for these exact authored control revisions.
// Titles alone never opt an unrelated or newly changed game into a policy.
const BUILDS = Object.freeze({
 'Stumble Run': ['stumble','93f8e3c2d6a6bc2fea77230b5520938b47db918d051036470b37def5a49ea170'],
 'Pulse Prism': ['trig','b9e6b8fe37296d49920015728d5543b66e50405be1940d0bcd09d665c1ee71d3'],
 'RIFF RUSH': ['riff','6fb19a94d4b4bdd3885d5dcdb5b773c26ec71d863451a046084a0d92c4481618'],
 'FLIGHT HORIZON': ['flight','385bf97d3ab67142327639f94bf466216efd2a0126d248c09815c0adaa491dae'],
 'Save the Doge': ['doge','47a4a719886ab8b7601560041ec77cbabcbe867098c177ca3b2943eb093da5c7'],
 'Roller Splat': ['roller','5f290b3914950c7fb40bbba4d1a7ebac1b5019ba4f4c1651098edf4142df25ad'],
 'Flappy Dunk': ['flappy','9ff1dc853f5c44cae79447d36cf720f2cf0bbe36092d4ed58c99cec0828b7676'],
 'Crowd Clash': ['crowd','97f24b1af87c9903ee43e886d9cb11991be04cd5df923c10ef3251adba9f27cc'],
 'Roof Rails': ['roof','21300e6d74d8d008c00c558ac01019476146e0f3a6da50613a42fe60f4a34247'],
 'Coast Racer': ['coast','2b85b59bd85224f1f392dbad40df2c72a7143b97afabc6abcfd293dd387d2d90'],
 'Hill Climb': ['hill','94ebfaead9f8d711aff1a6c8c38645200810fc8294b3fa0246ed84bdd5df536b'],
 'Drift King': ['drift','e9b5e782b2a42756481bfff014565213d7e65085f9697c91e9a0871764595cad'],
 'Zigzag': ['zigzag','0e18dd91025247885e22721c8a8b5a8e02f28ad77406e2a84f4d6c2b4b9f51fe'],
 'Goods Sort 3D': ['goods','5321b7fd578d522872be8784784e941bc038b4dd5dc0dc07bc263b5998dac40d'],
 'Sand Balls': ['sand','705ddc13e1de754fd625d808eb9e49f63fadde7f52ca865cc4d93ebd90721938'],
 'Whack Frenzy': ['whack','b5e30a8c28a16d952494370f0ed914f17b36373aac4fe27eb8c71d32f9c8a2d7'],
 'Golf Paradise': ['golf','49a4371e1c991b4c7966d93f9dfb0d62900a9d1b0e4dad1087da2309d04bb00b'],
 'Knockout Champ': ['boxing','834de3b7eb11f5cf1dc27b1008684abcc5adf1fa6cafe94e3f7135b46f67f4ea'],
 'Ping Pong Rally': ['pingpong','de8d7427b9f2f0ef747680d26a0f92def9305188cc9d8ffffae1f3a0038b800b'],
 'Zoomies': ['zoomies','e5249963504b70bf593ef844c022ba01fd23a7b3818eb3aa62bc8897b82c214c'],
 'Crumble Tanks': ['tanks','133b75c8e59b4bfe95923b48087242ff4ba8f82ea899b29352f14dc81e03553f'],
 'Lily Leap': ['lily','7757fa7b86f5e976d4730c10de5656d10b1a226c283bdfa1ee343a4142551713'],
 'Comet Catcher': ['comet','e173d8757486320fd5e35f14ce3da24c50bfec45e91689eb4fedb1be9116d8cf'],
 'Taiko Bloom': ['taiko','92de4bbd3a3baa3ca97b24dc053ef19068e6fcbca220e4232a8bdb0a0dc7f44e'],
});
export function authoredInputTitle(html){const title=/<title>\s*([^<]+?)\s*<\/title>/i.exec(String(html))?.[1];return Object.hasOwn(BUILDS,title)?title:!title&&/<script[^>]+src=[\"']game\.js[\"']/i.test(String(html))?'untitled':null;}
export function identifyGameInput(html,source){const title=authoredInputTitle(html);if(!title||typeof source!=='string')return null;const hash=createHash('sha256').update(source).digest('hex');if(title==='untitled')return ['FLIGHT HORIZON','RIFF RUSH'].map(t=>BUILDS[t]).find(b=>b[1]===hash)?.[0]??null;return hash===BUILDS[title][1]?BUILDS[title][0]:null;}

// Injected into the isolated game frame. Copy bounded scalar observations;
// never expose renderer/debug objects or call gameplay/state mutation methods.
export function readRecorderGame(target,kind){
 const titles={stumble:'Stumble Run',flight:'',riff:'',trig:'Pulse Prism',flappy:'Flappy Dunk',roller:'Roller Splat',doge:'Save the Doge',coast:'Coast Racer',roof:'Roof Rails',crowd:'Crowd Clash',hill:'Hill Climb',drift:'Drift King',zigzag:'Zigzag',goods:'Goods Sort 3D',sand:'Sand Balls',whack:'Whack Frenzy',golf:'Golf Paradise',boxing:'Knockout Champ',pingpong:'Ping Pong Rally',zoomies:'Zoomies',tanks:'Crumble Tanks',lily:'Lily Leap',comet:'Comet Catcher',taiko:'Taiko Bloom'};
 if(target.document.title.trim()!==titles[kind])return null;
 const api=target.__game;
 try{
  if(kind==='stumble'){
   // Its authored snap() mutates the player's steering target. Observe only
   // rendered HUD and joystick DOM instead; never invoke that debug helper.
   const text=q=>target.document.querySelector(q)?.textContent||'',score=Number(text('.sr-score').replaceAll(',','')),rank=Number(text('.sr-pill b'));
   const call=target.document.querySelector('.sr-call'),message=String(call?.textContent||'').trim(),visible=Number(call?.style.opacity||0)>.1;
   if(!text('.sr-score')||![score,rank].every(Number.isFinite)||rank<1||rank>40)return null;
   return {kind,state:visible&&/OOPS|ELIMINATED/i.test(message)?'hit':'play',score,rank,callout:visible?message.slice(0,40):''};
  }
  if(kind==='flight'){
   const text=selector=>target.document.querySelector(selector)?.textContent||'',score=Number(text('[data-slop-hud="score"]')),alt=Number(text('.fh-alt')),speed=Number(text('.fh-speed'));
   const angle=Number(/rotate\(([-.\d]+)deg\)/.exec(target.document.querySelector('.fh-arrow')?.style.transform||'')?.[1]);
   if(![score,alt,speed,angle].every(Number.isFinite)||!text('.fh-route'))return null;
   return {kind,state:'play',score,alt,speed,angle,warning:text('.fh-warning').slice(0,80)};
  }
  if(kind==='riff'){
   const canvas=target.document.querySelector('canvas[aria-label]'),label=canvas?.getAttribute('aria-label')||'';
   const score=Number((target.document.querySelector('.rr-score')?.textContent||'').replaceAll(',',''));
   const combo=Number(target.document.querySelector('.rr-combo')?.textContent),now=target.performance.now();
   const pads=Array.from(target.document.querySelectorAll('.rr-pad')).slice(0,4).map(p=>{const r=p.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
   if(!label.startsWith('RIFF RUSH')||pads.length!==4||![score,combo,now,...pads.flatMap(p=>[p.x,p.y])].every(Number.isFinite))return null;
   return {kind,state:label.includes('Round ended.')?'over':'play',score,combo,now,pads};
  }
  if(kind==='trig'){
   const cv=target.document.querySelector('canvas'),r=cv?.getBoundingClientRect();if(!r||r.width<100||r.height<100)return null;
   const ctx=cv.getContext('2d');if(!ctx)return null;
   const scale=Math.min(r.width/390,r.height/844),ox=(r.width-390*scale)/2,oy=(r.height-844*scale)/2,dpr=cv.width/r.width;
   // Read a small lower-playfield rectangle. Bright obstacle/player pixels
   // are visible to players; no closure variables or game state are exposed.
   const x0=Math.floor((ox+78*scale)*dpr),y0=Math.floor((oy+410*scale)*dpr),w=Math.ceil(210*scale*dpr),h=Math.ceil(294*scale*dpr);
   const pixels=ctx.getImageData(x0,y0,w,h).data;let bottom=0,obstacle=390;
   for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,R=pixels[i],G=pixels[i+1],B=pixels[i+2],wx=(x+x0)/dpr/scale-ox/scale,wy=(y+y0)/dpr/scale-oy/scale;
    const cyan=G>195&&B>195&&R<145,magenta=R>120&&B>170&&G<150;
    if(cyan&&wx>=88&&wx<=118)bottom=Math.max(bottom,wy);
    if((cyan||magenta)&&wx>=145&&wy>648&&wy<699)obstacle=Math.min(obstacle,wx);
   }
   return {kind,state:'play',score:0,ground:bottom>682,bottom,obstacle};
  }
  if(!api)return null;

  const g=kind==='hill'&&typeof api.state==='function'?api.state():['taiko','golf'].includes(kind)?api:['pingpong','whack','drift'].includes(kind)&&typeof api.snapshot==='function'?api.snapshot():typeof api.snap==='function'?api.snap():null;
  const finite=(...values)=>values.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e8);
  if(kind==='flappy'){
   if(!g||typeof g.st!=='string'||!finite(g.score,g.t,g.x,g.y,g.vx,g.vy,g.floor,g.vxNow,g.passed,g.swishes,api.R,api.G,api.FLAP,api.RIM)||!Array.isArray(g.hoops)||g.hoops.length>2)return null;
   const hoops=g.hoops.map(h=>Object.fromEntries(['x','y','baseY','amp','freq','ph','ang','half'].map(k=>[k,h[k]])));
   if(hoops.some(h=>!finite(...Object.values(h))))return null;
   return {kind,state:g.st==='dead'?'dead':'play',phase:g.st,score:g.score,t:g.t,x:g.x,y:g.y,vx:g.vx,vy:g.vy,floor:g.floor,vxNow:g.vxNow,passed:g.passed,swishes:g.swishes,R:api.R,G:api.G,F:api.FLAP,RIM:api.RIM,hoops};
  }
  if(kind==='roller'){
   if(!g||typeof g.state!=='string'||!finite(g.score,g.gw,g.gh,g.pos,g.queue,g.clears,g.tiles)||typeof g.moving!=='boolean'||typeof g.grid!=='string'||g.grid.length>2500||g.grid.length!==g.gw*g.gh||!/^[#.o]+$/.test(g.grid)||g.pos<0||g.pos>=g.grid.length)return null;
   return {kind,state:['clear','trans'].includes(g.state)?'play':g.state,phase:g.state,score:g.score,grid:g.grid,gw:g.gw,pos:g.pos,moving:g.moving,queue:g.queue,clears:g.clears,tiles:g.tiles};
  }
  if(kind==='doge'){
   if(!g||typeof g.state!=='string'||!finite(g.score,g.scene,g.swarmT,g.bees)||typeof api.hintArc!=='function')return null;
   const path=g.state==='draw'?api.hintArc():null;
   if(path!==null&&(!Array.isArray(path)||path.length<4||path.length>100||path.length%2||!finite(...path)))return null;
   return {kind,state:['draw','swarm','win','pan'].includes(g.state)?'play':g.state,phase:g.state,score:g.score,scene:g.scene,swarm:g.swarmT,bees:g.bees,path};
  }
  if(['coast','roof','crowd'].includes(kind)){
   if(!g||typeof g.state!=='string'||!finite(g.score))return null;
   const fields=kind==='coast'?['x','targetX','v','pxPerM','cars','near']:kind==='roof'?['x','s','v','K','L','R','gaps','saws','pieces','gemsAhead','gems']:['count','cx','targetX','cd','mx','speed','T','HW','K','rows','cleared'];
   const bounded=v=>typeof v==='number'?finite(v):v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=20||Array.isArray(v)&&v.length<=100&&v.every(bounded)||!!v&&typeof v==='object'&&Object.keys(v).length<=20&&Object.values(v).every(bounded);
   const result={kind,state:['run','stairs','clash'].includes(g.state)?'play':g.state,score:g.score};
   for(const k of fields){if(!bounded(g[k]))return null;result[k]=g[k];}
   if(kind==='coast'&&(!Array.isArray(g.cars)||!finite(g.x,g.targetX,g.v,g.pxPerM)||g.pxPerM<=0))return null;
   if(kind==='roof'&&(!Array.isArray(g.gaps)||!Array.isArray(g.saws)||!Array.isArray(g.pieces)||!Array.isArray(g.gemsAhead)||!finite(g.K,g.x)||g.K<=0))return null;
   if(kind==='crowd'&&(!Array.isArray(g.rows)||!finite(g.K,g.targetX,g.count)||g.K<=0||g.rows.some(r=>r.type==='gate'&&(!['+','x','-','/'].includes(r.L?.k)||!['+','x','-','/'].includes(r.R?.k)))))return null;
   return result;
  }
  if(kind==='hill'){
   if(!g||typeof g.over!=='boolean'||typeof g.grounded!=='boolean'||!finite(g.score,g.rel,g.a,g.slopeAhead,g.w,g.dist,g.coins))return null;
   return {kind,state:g.over?'over':'play',score:g.score,grounded:g.grounded,tilt:g.rel,angle:g.a,slope:g.slopeAhead,spin:g.w,distance:g.dist,coins:g.coins};
  }
  if(kind==='drift'){
   if(!g||typeof g.mode!=='string'||!finite(g.score,g.gap,g.s,g.perfects,g.coins)||typeof api.advice!=='function')return null;
   const advice=api.advice();if(advice!==0&&advice!==1)return null;
   return {kind,state:g.mode==='run'?'play':g.mode,score:g.score,gap:g.gap,distance:g.s,perfects:g.perfects,coins:g.coins,hold:advice===1};
  }
  if(kind==='zigzag'){
   if(!g||typeof g.state!=='string'||!finite(g.score,g.x,g.z,g.v,g.turns,g.perfects)||![0,1].includes(g.dir)||typeof api.tileAt!=='function')return null;
   const x=Math.round(g.x),z=Math.round(g.z),ahead=g.dir===0?api.tileAt(x+1,z):api.tileAt(x,z-1),side=g.dir===0?api.tileAt(x,z-1):api.tileAt(x+1,z);
   if(typeof ahead!=='boolean'||typeof side!=='boolean')return null;
   return {kind,state:['ready','roll'].includes(g.state)?'play':g.state,phase:g.state,score:g.score,speed:g.v,turn:!ahead&&side,along:g.dir===0?g.x-x:z-g.z,turns:g.turns,perfects:g.perfects};
  }
  if(kind==='goods'){
   if(!g||typeof g.mode!=='string'||!finite(g.score,g.clears,g.free)||!Array.isArray(g.comps)||g.comps.length>24)return null;
   const shelves=g.comps.map(c=>({front:c.front,slots:c.slots,layers:c.layers}));
   if(shelves.some(c=>!Array.isArray(c.front)||c.front.length!==3||c.front.some(v=>!Number.isInteger(v)||v< -2||v>10)||!Array.isArray(c.slots)||c.slots.length!==3||c.slots.some(p=>!finite(p.x,p.y))))return null;
   return {kind,state:g.mode,score:g.score,clears:g.clears,free:g.free,shelves};
  }
  if(kind==='sand'){
   if(!g||typeof g.state!=='string'||!finite(g.score,g.floor,g.digs,g.carved)||typeof api.digPath!=='function')return null;
   // This authored helper runs a BFS over visible rock clearance in local
   // arrays. It does not dig, advance time, spawn balls or change game state.
   const path=g.truck?.state==='park'?api.digPath():null;
   if(path!==null&&(!Array.isArray(path)||path.length>200||path.some(p=>!Array.isArray(p)||p.length!==2||!finite(...p))))return null;
   return {kind,state:g.state,score:g.score,floor:g.floor,digs:g.digs,carved:g.carved,path};
  }
  if(kind==='whack'){
   if(!g||typeof g.over!=='boolean'||!finite(g.score,g.lives,g.input?.bonks,g.input?.bombs)||!Array.isArray(g.holes)||g.holes.length>16)return null;
   const holes=g.holes.map(h=>({id:h.i,state:h.state,type:h.type,height:h.h,x:h.hx,y:h.hy,left:h.left}));
   if(holes.some(h=>!finite(h.id,h.height,h.x,h.y,h.left)||typeof h.state!=='string'||typeof h.type!=='string'))return null;
   return {kind,state:g.over?'over':'play',score:g.score,lives:g.lives,bonks:g.input.bonks,bombs:g.input.bombs,holes};
  }
  if(kind==='golf'){
   if(typeof g.state!=='string'||!finite(g.score,g.hole,g.strokes,g.counters?.shots)||typeof g.canShoot!=='boolean'||typeof g.camSettled!=='boolean')return null;
   // Scalar getters only: plan/predict/dragFor mutate simulator/camera scratch
   // state and are deliberately never called by the live recorder.
   return {kind,state:['aim','roll','sink'].includes(g.state)?'play':g.state,phase:g.state,score:g.score,hole:g.hole,strokes:g.strokes,shots:g.counters.shots,canShoot:g.canShoot,settled:g.camSettled};
  }
  if(kind==='boxing'){
   if(!g||typeof g.over!=='boolean'||!finite(g.px,g.score,g.lives,g.side,g.pjab,g.stats?.hits,g.stats?.kos,g.stats?.perfects,g.stats?.landed)||typeof g.star!=='boolean'||typeof g.guard!=='boolean'||typeof g.feint!=='boolean'||typeof g.straight!=='boolean'||!(g.tImp===null||finite(g.tImp))||!(g.os===null||typeof g.os==='string'&&g.os.length<20))return null;
   return {kind,state:g.over?'over':'play',score:g.score,x:g.px,lives:g.lives,opponent:g.os,side:g.side,straight:g.straight,feint:g.feint,impact:g.tImp,star:g.star,guard:g.guard,jabAge:g.pjab,hits:g.stats.hits,kos:g.stats.kos,perfects:g.stats.perfects,landed:g.stats.landed};
  }
  if(kind==='pingpong'){
   if(!g||typeof g.over!=='boolean'||typeof g.started!=='boolean'||!finite(g.score,g.lives,g.hits)||!(g.pred===null||finite(g.pred.fx,g.pred.fy,g.pred.t)&&typeof g.pred.high==='boolean'))return null;
   return {kind,state:g.over?'over':'play',score:g.score,lives:g.lives,hits:g.hits,started:g.started,pred:g.pred?{x:g.pred.fx,y:g.pred.fy,eta:g.pred.t,high:g.pred.high}:null};
  }
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
export const GAME_WARMUP_FRAMES=Object.freeze({stumble:6,flight:30,riff:6,trig:6,flappy:12,roller:6,doge:6,coast:15,roof:15,crowd:15,hill:15,drift:45,zigzag:12,goods:6,sand:60,whack:6,golf:45,boxing:12,pingpong:18,zoomies:45,tanks:30,lily:12,comet:30,taiko:66});
// The boxing sway spring is stable at its authored 60Hz update cadence.
// Substep its clock without changing the 30fps clip's duration or any state.
export function gameInputSimulationSteps(kind){return kind==='boxing'?2:1;}
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
   if(kind==='stumble'){
    const rise=clamp(frame/3,0,1),center=clamp((frame-26)/7,0,1);
    return move(width*.5+24*rise*(1-center),height*.76-(49+6*center)*rise);
   }
   if(kind==='flight'){
    if(!finger)return move(width*.5,height*.72);
    const dx=clamp(g.angle*.8,-25,25),dy=clamp((220-g.alt)*.18,-7,7);
    return move(width*.5+dx,height*.72-dy);
   }
   if(kind==='riff'){
    if(!gesture){gesture={start:g.now,index:0,beat:2.5};return tap(g.pads[0].x,g.pads[0].y);}
    if(gesture.index>=8)return [];
    if((g.now-gesture.start)/1000>=gesture.beat-.02){const i=gesture.index++,p=g.pads[[0,1,2,3,2,1,3,1][i]],fraction=(i%16)/16,blend=fraction*fraction*(3-2*fraction),tempo=90+138*(1-Math.exp(-.1))*blend;gesture.beat+=60/tempo;return tap(p.x,p.y);}return [];
   }
   if(kind==='trig'){
    if(finger)return end();
    rollLane=Number.isFinite(g.bottom)&&Math.abs(g.bottom-goal)<1.4?rollLane+1:0;goal=g.bottom;
    const landed=g.bottom>450&&rollLane>=(g.ground?1:2);
    if(gesture&&frame>=gesture.second){gesture=null;nextAction=frame+16;return move(width*.5,height*.55);}
    if(frame>=nextAction&&landed&&g.obstacle<220){gesture={second:frame+13};nextAction=frame+30;return move(width*.5,height*.55);}return [];
   }
   if(kind==='flappy'){
    if(frame<nextAction)return [];
    if(g.phase==='idle'||g.y+g.R>g.floor-190&&g.vy>150||flappyTap(g)){nextAction=frame+3;return tap(width*.5,height*.6);}return [];
   }
   if(kind==='roller'){
    if(gesture){const age=frame-gesture.start;if(age>=4){gesture=null;return end();}return move(width*.5+gesture.dx*age*18,height*.62+gesture.dy*age*18);}
    if(g.phase!=='play'||g.moving||g.queue||frame<nextAction)return [];
    const d=rollerDirection(g);if(d<0)return [];
    gesture={start:frame,dx:[0,1,0,-1][d],dy:[-1,0,1,0][d]};nextAction=frame+9;return move(width*.5,height*.62);
   }
   if(kind==='doge'){
    if(gesture){const i=frame-gesture.start;if(i*2>=gesture.path.length){gesture=null;return end();}return move(gesture.path[i*2],gesture.path[i*2+1]);}
    if(g.phase==='draw'&&g.path&&frame>=nextAction){gesture={start:frame,path:g.path.slice()};nextAction=frame+40;return move(g.path[0],g.path[1]);}return end();
   }
   if(['coast','roof','crowd'].includes(kind)){
    if(!finger)return move(width*.5,height*.74);
    if(frame-lastDecision>=3){lastDecision=frame;goal=kind==='coast'?coastLane(g):kind==='roof'?roofTarget(g):crowdTarget(g);}
    const actual=kind==='coast'?g.targetX:kind==='roof'?g.x:g.targetX,scale=kind==='coast'?g.pxPerM:1/g.K;
    const dx=clamp((goal-actual)*scale,-width*.022,width*.022),x=finger.x+dx;
    if(x<width*.1||x>width*.9)return [...end(),...move(width*.5,height*.74)];
    return move(x,height*.74);
   }
   if(kind==='hill'){
    if(frame<nextAction)return [];nextAction=frame+3;
    const predicted=g.angle-g.slope+g.spin*.3;
    const side=g.grounded?(g.tilt>.5?'brake':g.tilt>.32?null:'gas'):(predicted<-.2?'gas':predicted>.2?'brake':null);
    if(!side)return end();const x=width*(side==='gas'?.8:.2),y=height*.86;
    if(finger&&Math.abs(finger.x-x)<1)return [];return [...end(),...move(x,y)];
   }
   if(kind==='drift'){
    if(frame<nextAction)return [];nextAction=frame+3;
    return g.hold?move(width*.5,height*.62):end();
   }
   if(kind==='zigzag'){
    if(frame<nextAction)return [];
    if(g.phase==='ready'||g.turn&&g.along>=-g.speed*.03){nextAction=frame+4;return tap(width*.5,height*.7);}
    return [];
   }
   if(kind==='goods'){
    if(!gesture&&frame>=nextAction){const choice=chooseGoodsMove(g.shelves,g.free);if(choice){gesture={at:frame,from:choice[0],to:choice[1]};nextAction=frame+27;}}
    if(!gesture)return [];
    const age=frame-gesture.at;if(age===0)return move(gesture.from.x,gesture.from.y);
    if(age<18){const t=Math.min(1,age/14),ease=t*t*(3-2*t);return move(gesture.from.x+(gesture.to.x-gesture.from.x)*ease,gesture.from.y+(gesture.to.y-gesture.from.y)*ease);}
    gesture=null;return end();
   }
   if(kind==='sand'){
    if(!gesture&&frame>=nextAction&&g.path?.length>1){gesture={at:frame,path:g.path.map(p=>point(...p)),index:0};nextAction=frame+45;}
    if(!gesture)return [];
    const p=gesture.path[gesture.index];if(!finger)return move(p.x,p.y);
    const distance=Math.hypot(p.x-finger.x,p.y-finger.y),max=height*.03;
    if(distance<max){const events=move(p.x,p.y);gesture.index++;if(gesture.index===gesture.path.length){gesture=null;nextAction=frame+20;events.push(...end());}return events;}
    return move(finger.x+(p.x-finger.x)*max/distance,finger.y+(p.y-finger.y)*max/distance);
   }
   if(kind==='whack'){
    if(frame<nextAction)return [];
    const m=g.holes.filter(h=>['rise','up','daze','peekDown'].includes(h.state)&&h.height>.5&&h.type!=='bomb').sort((a,b)=>a.left-b.left)[0];
    if(!m)return [];nextAction=frame+6;return tap(m.x,m.y);
   }
   if(kind==='golf'){
    // The authored opening fairway is straight ahead. Full power follows the
    // visible center line; a normal paced drag demonstrates the entire putt.
    if(!gesture&&g.hole===0&&g.strokes===0&&g.canShoot&&g.settled&&frame>=nextAction){gesture={at:frame};nextAction=frame+90;}
    if(!gesture)return [];
    const age=frame-gesture.at,distance=Math.max(110,Math.min(220,width*.36)),x=width*.5,y=height*.58-distance*.5;
    if(age===0)return move(x,y);
    if(age<20)return move(x,y+distance*Math.min(1,age/14));
    gesture=null;return end();
   }
   if(kind==='boxing'){
    if(gesture){const age=frame-gesture.at;if(age<=3)return move(width*.5,height*.74-age*24);gesture=null;return end();}
    if(frame<nextAction)return [];
    if(g.star){nextAction=frame+8;return tap(width*.5,height*.65);}
    if(['tell','strike'].includes(g.opponent)){
     if(!g.feint&&g.impact!==null&&g.impact>0&&g.impact<.2){nextAction=frame+9;return tap(width*(g.straight?.25:g.side>0?.25:.75),height*.68);}
     return [];
    }
    if(['idle','recover','gloat'].includes(g.opponent)&&!g.guard&&g.jabAge>.35){gesture={at:frame};nextAction=frame+13;return move(width*.5,height*.74);}
    return [];
   }
   if(kind==='pingpong'){
    if(!g.started){nextAction=frame+6;return tap(width*.5,height*.75);}
    if(gesture){const age=frame-gesture.at;if(age<=4)return move(gesture.x+gesture.dx*age/4,gesture.y-gesture.length*age/4);gesture=null;nextAction=frame+5;return [];}
    if(frame<nextAction)return [];
    const p=g.pred;
    if(!p||p.eta>.6)return [];
    const wanted=point(p.x,p.y+20);
    if(!finger)return move(wanted.x,wanted.y);
    if(p.eta<.16){gesture={at:frame,x:finger.x,y:finger.y,dx:0,length:p.high?130:95};return [];}
    return move(slew(finger.x,wanted.x,width*.025),slew(finger.y,wanted.y,height*.025));
   }
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
export function gameInputProgress(g){if(!g)return null;const out={state:g.state,score:g.score};for(const key of ['x','yaw','rank','crashes','passes','boosts','moves','hp','kills','drags','row','chain','caught','hits','taps','lives','kos','perfects','landed','hole','strokes','shots','clears','floor','digs','carved','bonks','bombs','distance','coins','gap','turns','near','gems','count','cleared','combo','passed','swishes','scene','bees','alt','speed'])if(Number.isFinite(g[key]))out[key]=g[key];return out;}

export function continuousGameInput(g){return !!g&&(g.state==='play'||g.kind==='tanks'&&['battle','kill','advance'].includes(g.state));}

// Greedy sorting over visible front slots only. Complete triples, make pairs,
// or open a mixed shelf. No hidden layer information or random tap fallback.
export function chooseGoodsMove(shelves,free){
 const cells=shelves.map(s=>s.front),empty=i=>cells[i].map((v,k)=>v===-1?k:-1).filter(k=>k>=0),items=i=>cells[i].map((v,k)=>v>=0?k:-1).filter(k=>k>=0),busy=i=>cells[i].includes(-2);
 const kind=i=>{const types=new Set(cells[i].filter(v=>v>=0&&v!==10));return types.size>1?-2:types.size?[...types][0]:-1;};
 const source=(type,except)=>cells.flatMap((c,i)=>i===except||busy(i)?[]:c.flatMap((v,k)=>v>=0&&(type<0||v===type||v===10)?[[i,k]]:[]));
 const pick=(a,b)=>[shelves[a[0]].slots[a[1]],shelves[b[0]].slots[b[1]]];
 for(const count of [2,1])for(let i=0;i<cells.length;i++){
  if(busy(i)||items(i).length!==count||!empty(i).length||kind(i)===-2)continue;
  const sources=source(kind(i),i).filter(p=>count===2||kind(p[0])===-2||items(p[0]).length===1).sort((a,b)=>(kind(b[0])===-2?3:0)-(kind(a[0])===-2?3:0));
  if(sources.length)return pick(sources[0],[i,empty(i)[0]]);
 }
 const vacant=cells.findIndex((_,i)=>!busy(i)&&empty(i).length===3);
 if(vacant>=0&&free>=5)for(let i=0;i<cells.length;i++)if(!busy(i)&&kind(i)===-2)return pick([i,items(i)[0]],[vacant,1]);
 return null;
}
