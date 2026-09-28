import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredInputTitle,identifyGameInput,readRecorderGame,installGameObservation,createGameInputController,continuousGameInput,gameInputSimulationSteps} from '../scripts/mcp-publisher/game-input.mjs';
const size={width:360,height:640};
const target=(title,game)=>({document:{title},__game:game});

test('game-aware input requires a known title and exact control revision',()=>{
 assert.equal(authoredInputTitle('<title>Zoomies</title>'),'Zoomies');
 assert.equal(authoredInputTitle('<title>Unrelated game</title>'),null);
 assert.equal(identifyGameInput('<title>Zoomies</title>','different game source'),null);
 assert.equal(identifyGameInput('<title>Taiko Bloom</title>',null),null);
 let called=0;assert.equal(readRecorderGame(target('Other',{snap(){called++;}}),'zoomies'),null);assert.equal(called,0);
});

test('observation bridge accepts only parent requests and never invokes gameplay mutations',()=>{
 let handler;const replies=[];
 const api={snap:()=>({state:'play',score:10,row:1,chain:1,idle:0,queued:0,hop:false,next:{predictedX:.1,r:1}}),resetLatency(){throw Error('mutation');},debug:new Proxy({},{get(){throw Error('debug read');}})};
 const t={...target('Lily Leap',api),parent:{postMessage:m=>replies.push(JSON.parse(m))},addEventListener:(_,f)=>{handler=f;}};
 installGameObservation(readRecorderGame,t);
 const request={data:JSON.stringify({type:'slopRecorderObserve',seq:1,kind:'lily'})};
 handler({...request,source:{}});assert.equal(replies.length,0);
 handler({...request,source:t.parent});assert.deepEqual(replies[0].observation.next,{x:.1,r:1});assert.equal(replies[0].seq,1);
 api.snap=()=>({state:'play',score:10});handler({...request,source:t.parent});assert.equal(replies.at(-1).observation,null);
});

test('tank observation computes an aim only when a normal shot is available',()=>{
 let canFire=false,calls=0;
 const t=target('Crumble Tanks',{snap:()=>({state:'battle',score:0,kills:0,hp:3,canFire,input:{drags:0}}),aim(){calls++;return {ang:1,pow:.6};}});
 assert.equal(readRecorderGame(t,'tanks').aim,null);assert.equal(calls,0);
 canFire=true;assert.deepEqual(readRecorderGame(t,'tanks').aim,{angle:1,power:.6});assert.equal(calls,1);
 t.__game.aim=()=>({ang:NaN,pow:1});assert.equal(readRecorderGame(t,'tanks'),null);
});

function assertSmooth(events,limit){let finger=null,starts=0,moves=0;for(const e of events){
 if(e.type==='touchStart'){assert.equal(finger,null,'only one held finger');finger=e;starts++;}
 else if(e.type==='touchMove'){assert.ok(finger,'moves follow a press');assert.ok(Math.abs(e.x-finger.x)<=limit+.001,'horizontal motion must be smooth');assert.ok(Math.abs(e.y-finger.y)<=limit+.001,'vertical motion must be smooth');finger=e;moves++;}
 else{assert.ok(finger,'release follows a press');finger=null;}
 if(e.type!=='touchEnd'){assert.ok(e.x>0&&e.x<360&&e.y>0&&e.y<640);}}
 assert.equal(finger,null);return {starts,moves};}

test('Zoomies holds one finger and limits steering slew through alternating bends',()=>{
 const c=createGameInputController('zoomies',size),events=[];
 for(let f=0;f<240;f++)events.push(...c.next(f,{kind:'zoomies',state:'play',x:f<120?3:-3,v:30,yaw:0,pxPerU:68,ahead:Array(11).fill(f<120?.012:-.012),drift:{on:false,dir:1,tier:0}}));
 events.push(...c.reset());const stats=assertSmooth(events,360*.008);assert.equal(stats.starts,1);assert.ok(stats.moves>20);
});

test('Comet Catcher retains a close target, smoothly changes direction and avoids a nearby hazard',()=>{
 const c=createGameInputController('comet',size),events=[];let x=0;
 for(let f=0;f<180;f++){
 const bad=f>=90?[{x:2.8,y:-2,speed:2,bad:true}]:[];
 const out=c.next(f,{kind:'comet',state:'play',x,mouthY:-3,fever:0,items:[{x:2.8,y:0,speed:2,bad:false},{x:-2.8,y:f%2?-.1:.1,speed:2,bad:false},...bad]});
 events.push(...out);const e=out.find(e=>e.x!=null);if(e)x=(e.x/360-.5)*10;
 if(f===89)assert.ok(x>1.5,'near-equal ETA targets must not cause repeated lane changes');
 }
 events.push(...c.reset());const stats=assertSmooth(events,360*.011);assert.equal(stats.starts,1);assert.ok(Math.abs(x+.2-2.8)>1.2,'finish outside the hazard lane');
});

test('Lily Leap waits for a safe landing and spaces deliberate hops without queuing',()=>{
 const c=createGameInputController('lily',size),g={kind:'lily',state:'play',hop:false,queued:0,next:{x:1,r:1}};
 assert.deepEqual(c.next(0,g),[]);g.next.x=.1;
 const taps=[];for(let f=1;f<120;f++){if(c.next(f,{...g,hop:f>=12&&f<=30}).length)taps.push(f);}
 assert.ok(taps.length>=5&&taps.length<=10);for(let i=1;i<taps.length;i++)assert.ok(taps[i]-taps[i-1]>=12);
 assert.deepEqual(c.next(200,{...g,queued:1}),[]);
});

test('Crumble Tanks uses a deliberate complete pull, hold and release then waits for the shell',()=>{
 const c=createGameInputController('tanks',size),g={kind:'tanks',state:'battle',canFire:true,aim:{angle:1,power:.6}},events=[];let ended=false;
 for(let f=0;f<90;f++){const e=c.next(f,{...g,canFire:!ended});events.push(...e);if(e.some(e=>e.type==='touchEnd'))ended=true;}
 const stats=assertSmooth(events,360*.025);assert.equal(stats.starts,1);assert.ok(stats.moves>=10);
 const start=events[0],finish=events.at(-2);assert.ok(finish.x<start.x&&finish.y>start.y);
 assert.ok(Math.abs(Math.hypot(finish.x-start.x,finish.y-start.y)-.6*160)<1);
});

test('Taiko Bloom anticipates a visible beat once, uses a moderate alternating roll and resets note IDs',()=>{
 const c=createGameInputController('taiko',size),g={kind:'taiko',state:'play',roll:false,targets:[{x:100,y:420},{x:260,y:420}],notes:[{id:1,lane:1,eta:.4}]};
 assert.deepEqual(c.next(0,g),[]);g.notes[0].eta=.05;assert.equal(c.next(10,g)[0].x,260);assert.deepEqual(c.next(14,g),[]);
 const xs=[];for(let f=15;f<45;f++){const e=c.next(f,{...g,roll:true});if(e.length)xs.push(e[0].x);}
 assert.ok(xs.length<=6);assert.ok(xs.every((x,i)=>!i||x!==xs[i-1]));c.reset();assert.equal(c.next(0,g)[0].x,260);
});

test('continuous clips reject dying, dead, missing observations and allow natural tank transitions',()=>{
 for(const state of ['dying','dead','over','boot'])assert.equal(continuousGameInput({kind:'comet',state}),false);
 assert.equal(continuousGameInput(null),false);assert.equal(continuousGameInput({kind:'comet',state:'play'}),true);
 for(const state of ['battle','kill','advance'])assert.equal(continuousGameInput({kind:'tanks',state}),true);
});


test('boxing observation stays read-only and normal inputs dodge then counter',()=>{
 const raw={px:0,over:false,score:0,lives:3,side:1,pjab:9,stats:{hits:0,kos:0,perfects:0,landed:0},star:false,guard:false,feint:false,straight:false,tImp:.16,os:'tell'};
 const g=readRecorderGame(target('Knockout Champ',{snap:()=>raw,spawn(){throw Error('state mutation');}}),'boxing');
 assert.equal(g.state,'play');
 const c=createGameInputController('boxing',size);
 const dodge=c.next(0,g);assert.equal(dodge[0].x,90);assert.equal(dodge.at(-1).type,'touchEnd');
 assert.deepEqual(c.next(1,g),[],'do not spam the same attack');
 const star=c.next(10,{...g,star:true,opponent:'stun'});assert.equal(star.length,2);
 const events=[];for(let f=20;f<28;f++)events.push(...c.next(f,{...g,star:false,opponent:'recover'}));
 const downs=events.filter(e=>e.type==='touchStart');assert.equal(downs.length,1);
 assert.equal(events.at(-1).type,'touchEnd');assert.equal(events.filter(e=>e.type==='touchMove').length,3);
 assert.equal(readRecorderGame(target('Knockout Champ',{snap:()=>({...raw,tImp:Infinity})}),'boxing'),null);
});

test('boxing 60Hz substeps bound the authored spring without speeding up video',()=>{
 function simulate(steps){let x=0,v=0,max=0;const dt=1/30/steps;
 for(let f=0;f<210;f++)for(let k=0;k<steps;k++){v+=(26*26*(.62-x)-2*26*v)*dt;x+=v*dt;max=Math.max(max,Math.abs(x));}return max;}
 assert.ok(simulate(1)>100,'reproduces the30Hz camera runaway');
 assert.ok(simulate(gameInputSimulationSteps('boxing'))<.7,'same seven seconds remain bounded');
 assert.equal(gameInputSimulationSteps('boxing')*(1/30/gameInputSimulationSteps('boxing')),1/30);
 assert.equal(gameInputSimulationSteps('pingpong'),1);assert.equal(gameInputSimulationSteps(null),1);
});

test('ping pong tracks a predicted incoming ball and completes one paced swipe',()=>{
 const api={snapshot:()=>({over:false,started:true,score:0,lives:3,hits:0,pred:{fx:170,fy:350,t:.4,high:false}}),debug:new Proxy({},{get(){throw Error('debug read');}})};
 const g=readRecorderGame(target('Ping Pong Rally',api),'pingpong');assert.deepEqual(g.pred,{x:170,y:350,eta:.4,high:false});
 const c=createGameInputController('pingpong',size),events=[...c.next(0,g)];
 for(let f=1;f<8;f++)events.push(...c.next(f,{...g,pred:f<3?{...g.pred,eta:.12}:null}));
 events.push(...c.reset());const stats=assertSmooth(events,32.5);assert.equal(stats.starts,1);assert.equal(stats.moves,4);
 assert.deepEqual(c.next(20,{...g,state:'over'}),[]);
});

test('golf observes only scalar getters and plays one complete opening putt',()=>{
 const raw={state:'aim',score:0,hole:0,strokes:0,counters:{shots:0},canShoot:true,camSettled:true,plan(){throw Error('simulation mutation');},dragFor(){throw Error('camera mutation');},predict(){throw Error('time mutation');}};
 const g=readRecorderGame(target('Golf Paradise',raw),'golf');assert.equal(g.state,'play');
 const c=createGameInputController('golf',size),events=[];
 assert.deepEqual(c.next(0,{...g,settled:false}),[]);
 for(let f=1;f<25;f++)events.push(...c.next(f,g));
 const stats=assertSmooth(events,10);assert.equal(stats.starts,1);assert.equal(stats.moves,14);
 assert.ok(Math.abs(events.at(-2).y-events[0].y-129.6)<1e-9);
 assert.deepEqual(c.next(100,{...g,hole:1}),[],'never guess an unaudited later hole');
 assert.equal(continuousGameInput(readRecorderGame(target('Golf Paradise',{...raw,state:'hazard'}),'golf')),false);
});

test('sorting completes visible triples without using hidden layers',()=>{
 const raw={mode:'play',score:0,clears:0,free:5,comps:[{front:[1,1,-1],slots:[{x:60,y:200},{x:90,y:200},{x:120,y:200}],layers:99},{front:[1,2,3],slots:[{x:60,y:300},{x:90,y:300},{x:120,y:300}],layers:99}]};
 const g=readRecorderGame(target('Goods Sort 3D',{snap:()=>raw}),'goods'),c=createGameInputController('goods',size),events=[];
 for(let f=0;f<20;f++)events.push(...c.next(f,g));
 assert.equal(events[0].x,60);assert.equal(events[0].y,300);assert.equal(events.at(-2).x,120);assert.equal(events.at(-2).y,200);assert.equal(events.at(-1).type,'touchEnd');
 assert.equal(raw.comps[0].front[2],-1);assert.equal(readRecorderGame(target('Goods Sort 3D',{snap:()=>({...raw,comps:Array(25).fill(raw.comps[0])})}),'goods'),null);
});

test('sand and doge trace visible authored paths without invoking mutation helpers',()=>{
 let mutations=0;const bad=()=>{mutations++;throw Error('mutation');};
 const sand=readRecorderGame(target('Sand Balls',{snap:()=>({state:'play',score:0,floor:0,digs:0,carved:0,truck:{state:'park'}}),digPath:()=>[[100,100],[100,150],[110,200]],dig:bad,restart:bad}),'sand');
 assert.equal(sand.path.length,3);
 const doge=readRecorderGame(target('Save the Doge',{snap:()=>({state:'draw',score:0,scene:1,swarmT:10,bees:0}),hintArc:()=>[100,200,110,190,120,200],level:bad}),'doge');
 const c=createGameInputController('doge',size),events=[];for(let f=0;f<5;f++)events.push(...c.next(f,doge));
 assert.equal(events.filter(e=>e.type==='touchStart').length,1);assert.equal(events.filter(e=>e.type==='touchMove').length,2);assert.equal(events.at(-1).type,'touchEnd');assert.equal(mutations,0);
});

test('whack ignores bombs and limits deliberate hits',()=>{
 const g=readRecorderGame(target('Whack Frenzy',{snapshot:()=>({over:false,score:0,lives:3,input:{bonks:0,bombs:0},holes:[{i:0,state:'up',type:'bomb',h:1,hx:70,hy:300,left:.1},{i:1,state:'up',type:'mole',h:1,hx:200,hy:300,left:.2}]})}),'whack');
 const c=createGameInputController('whack',size),events=[];for(let f=0;f<30;f++)events.push(...c.next(f,g));
 assert.ok(events.filter(e=>e.type==='touchStart').every(e=>e.x===200));assert.ok(events.filter(e=>e.type==='touchStart').length<=5);
});

test('runner choices avoid an occupied lane and choose the beneficial visible gate',async()=>{
 const {coastLane,crowdTarget,roofTarget}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 assert.notEqual(coastLane({x:-1.7,v:30,cars:[{x:-1.7,z:-15,w:2,len:4,vt:4,lc:false}]}),-1.7);
 assert.equal(crowdTarget({count:15,cx:0,cd:0,mx:0,speed:8,T:0,HW:4,rows:[{type:'gate',d:12,L:{k:'+',v:5},R:{k:'x',v:2}}]}),2);
 const g={x:0,s:0,v:10,L:2,R:2,gaps:[],saws:[{x:0,ds:5,amp:0}],pieces:[],gemsAhead:[]};assert.ok(Math.abs(roofTarget(g))>.9);
});

test('roller solves visible maze without mutating it and waits for slides',async()=>{
 const {rollerDirection}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 const raw={state:'play',score:0,gw:5,gh:5,pos:6,queue:0,clears:0,tiles:0,moving:false,grid:'######o..##.#.##...######'};
 const g=readRecorderGame(target('Roller Splat',{snap:()=>raw,probe(){throw Error('board generation');}}),'roller');
 assert.equal(rollerDirection(g),1);const before=raw.grid,c=createGameInputController('roller',size);
 assert.deepEqual(c.next(0,{...g,moving:true}),[]);assert.equal(c.next(1,g)[0].type,'touchStart');
 for(let f=2;f<6;f++)c.next(f,g);assert.deepEqual(c.next(6,{...g,moving:true}),[]);assert.equal(raw.grid,before);
});

test('Flappy Dunk evaluates a bounded snapshot and preserves the game',async()=>{
 const {flappyTap}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 const raw={st:'idle',score:0,t:0,x:0,y:250,vx:180,vy:0,floor:640,vxNow:180,passed:0,swishes:0,hoops:[{x:200,y:400,baseY:400,amp:0,freq:0,ph:0,ang:0,half:70}]};
 const g=readRecorderGame(target('Flappy Dunk',{snap:()=>raw,R:16,G:900,FLAP:350,RIM:5}),'flappy');
 const before=JSON.stringify(raw);assert.equal(typeof flappyTap(g),'boolean');assert.equal(JSON.stringify(raw),before);
 const c=createGameInputController('flappy',size);assert.equal(c.next(0,g).length,2);assert.deepEqual(c.next(1,g),[]);
});

test('Riff Rush follows eight opening beats once and never invents later randomized notes',()=>{
 const pads=[0,1,2,3].map(i=>({x:45+i*90,y:560})),c=createGameInputController('riff',size),hits=[];
 for(let f=0;f<310;f++){const e=c.next(f,{kind:'riff',state:'play',score:0,now:f*1000/30,pads});if(e.length)hits.push({frame:f,lane:pads.findIndex(p=>p.x===e[0].x)});}
 assert.deepEqual(hits.map(h=>h.lane),[0,0,1,2,3,2,1,3,1]);assert.ok(hits[1].frame>=74&&hits[1].frame<=76);assert.ok(hits.slice(2).every((h,i)=>h.frame-hits[i+1].frame>=18));
});

test('TrigJump waits for a visible obstacle and makes a bounded double jump',()=>{
 const c=createGameInputController('trig',size),g={kind:'trig',state:'play',score:0,ground:true,bottom:701,obstacle:300};assert.deepEqual(c.next(0,g),[]);
 assert.equal(c.next(1,{...g,obstacle:200})[0].type,'touchStart');assert.equal(c.next(2,{...g,ground:false,obstacle:190})[0].type,'touchEnd');assert.equal(c.next(14,{...g,ground:false,obstacle:130})[0].type,'touchStart');assert.equal(c.next(15,{...g,ground:false})[0].type,'touchEnd');
});

test('hill controls release or brake an over-rotated car instead of continuously accelerating',()=>{
 const g=readRecorderGame(target('Hill Climb',{state:()=>({over:false,grounded:true,score:0,rel:.6,a:.6,slopeAhead:0,w:0,dist:1,coins:0})}),'hill');
 const c=createGameInputController('hill',size);assert.ok(c.next(0,g)[0].x<size.width*.5);
 assert.equal(c.next(4,{...g,tilt:0}).at(-1).x,size.width*.8);
 assert.equal(c.next(8,{...g,state:'over'})[0].type,'touchEnd');
});

test('drift reads the visible-road advice only and holds one contact while appropriate',()=>{
 const g=readRecorderGame(target('Drift King',{snapshot:()=>({mode:'run',score:0,gap:3,s:10,perfects:0,coins:0}),advice:()=>1,debug(){throw Error('mutation');}}),'drift');
 const c=createGameInputController('drift',size);assert.equal(c.next(0,g)[0].type,'touchStart');assert.deepEqual(c.next(4,g),[]);assert.equal(c.next(8,{...g,hold:false})[0].type,'touchEnd');
});

test('Zigzag only turns at a visible missing forward tile and available side tile',()=>{
 const g=readRecorderGame(target('Zigzag',{snap:()=>({state:'roll',score:0,x:1,z:0,v:3,turns:0,perfects:0,dir:0}),tileAt:(x,z)=>z===-1}),'zigzag');
 assert.equal(g.turn,true);const c=createGameInputController('zigzag',size);assert.equal(c.next(0,g).length,2);assert.deepEqual(c.next(1,g),[]);assert.deepEqual(c.next(10,{...g,turn:false}),[]);
});

test('untitled native games still require an exact reviewed source digest',()=>{
 const html='<html><script src="game.js"></script></html>';
 assert.equal(authoredInputTitle(html),'untitled');assert.equal(identifyGameInput(html,'arbitrary code'),null);
 assert.equal(readRecorderGame(target('Flight clone',{}),'flight'),null);
});

test('Stumble Run reads visible HUD without its mutating debug snapshot and holds a smooth joystick',()=>{
 let snapCalls=0;const nodes={'.sr-score':{textContent:'8'},'.sr-pill b':{textContent:'1'},'.sr-call':{textContent:'',style:{opacity:'0'}}};
 const t={document:{title:'Stumble Run',querySelector:q=>nodes[q]},__game:{snap(){snapCalls++;throw Error('debug snapshot mutates steering');}}};
 const g=readRecorderGame(t,'stumble');assert.equal(g.rank,1);assert.equal(g.score,8);assert.equal(snapCalls,0);
 const c=createGameInputController('stumble',size),events=[];for(let f=0;f<210;f++)events.push(...c.next(f,g));events.push(...c.reset());
 assert.equal(assertSmooth(events,17).starts,1);
 nodes['.sr-call']={textContent:'OOPS!',style:{opacity:'1'}};
 assert.equal(continuousGameInput(readRecorderGame(t,'stumble')),false);assert.equal(snapCalls,0);
});

test('Crowd Clash reads exactly its authored snapshot fields and validates visible gate operations',()=>{
 const raw={state:'run',score:50,count:15,cx:0,targetX:0,cd:0,mx:0,speed:8,T:0,HW:4,K:36,cleared:0,rows:[{type:'gate',d:12,L:{k:'+',v:5},R:{k:'x',v:2}}]};
 const t=target('Crowd Clash',{snap:()=>raw});const g=readRecorderGame(t,'crowd');
 assert.equal(g.state,'play');assert.equal(g.count,15);assert.equal(g.rows.length,1);
 assert.ok(createGameInputController('crowd',size).next(0,g).some(e=>e.type==='touchStart'));
 raw.rows[0].L.k='eval';assert.equal(readRecorderGame(t,'crowd'),null);
});


test('Join Clash observes only bounded copied fields and steers visible recruits through a wall gap',async()=>{
 const raw={state:'run',T:0,md:0,mx:0,targetX:0,K:.028,HW:4.2,count:5,score:0,speed:7.4,R:.6,front:1,back:1,rage:0,recruits:0,kills:0,bossesBeaten:0,dodges:0,boss:null,hazards:[],idles:[{x:2,d:5,gold:false},{x:2.2,d:5.5,gold:false},{x:-2,d:25,gold:true}]};
 const t=target('Join Clash 3D',{snap:()=>raw,reset(){throw Error('mutation');}}),g=readRecorderGame(t,'join');
 const {joinTarget}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 assert.equal(joinTarget(g),2.1,'nearby recruits win over distant gold');g.idles[0].x=0;assert.equal(raw.idles[0].x,2);
 const wall={type:'wall',d:7,gaps:[[-1.6,1.6]]};assert.equal(joinTarget({...g,hazards:[wall]}),0);
 assert.equal(joinTarget({...g,md:7.6,hazards:[wall]}),0,'keep the tail within the gap');
 const c=createGameInputController('join',size),events=[];let x=0,fingerX=180;
 for(let f=0;f<150;f++){const e=c.next(f,{...g,targetX:x,mx:x,hazards:f>75?[wall]:[]});events.push(...e);for(const event of e){if(event.type==='touchMove')x+=(event.x-fingerX)*g.K;if(event.x!=null)fingerX=event.x;}}
 assert.ok(Math.abs(x)<.15,'finish centered in the gap');
 events.push(...c.reset());assertSmooth(events,360*.018);
 raw.hazards=[{type:'wall',d:5,gaps:[[2,1]]}];assert.equal(readRecorderGame(t,'join'),null);
});


test('Petal Storm copies visible bullets and dodges smoothly without touching debug state',async()=>{
 const raw={over:false,started:true,score:30,hero:[180,450],heroR:7,W:360,H:640,top:100,bottom:580,left:30,right:330,grazes:1,blooms:0,bullets:[[180,390,0,110,8,0,0]]};
 const g=readRecorderGame(target('Petal Storm',{snapshot:()=>raw,debug:new Proxy({},{get(){throw Error('debug access');}})}),'petal');
 const {petalDelta}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 const delta=petalDelta(g);assert.ok(Math.hypot(...delta)<=6.001);assert.ok(Math.abs(delta[0])>0,'leave the oncoming bullet lane');
 g.bullets[0][0]=200;assert.equal(raw.bullets[0][0],180);
 const c=createGameInputController('petal',size),events=[];for(let f=0;f<40;f++)events.push(...c.next(f,g));events.push(...c.reset());assertSmooth(events,6.001);
 assert.equal(continuousGameInput(readRecorderGame(target('Petal Storm',{snapshot:()=>({...raw,over:true})}),'petal')),false);
 const steps=gameInputSimulationSteps('petal'),dt=1/30/steps;
 assert.equal(steps*dt,1/30);assert.ok(dt<=.02,'normal update cadence must not trigger the authored slow-frame quality downgrade');
 raw.bullets[0][2]=NaN;assert.equal(readRecorderGame(target('Petal Storm',{snapshot:()=>raw}),'petal'),null);
});

test('Puff Gulp smoothly pursues food and releases ammo at danger without debug spawns',async()=>{
 const raw={mode:'play',over:false,score:3,hearts:3,belly:1,holding:true,ceil:90,floor:560,puff:{x:100,y:320,r:20},cone:{L:120,w1:60},input:{gulps:1,spits:0,hurts:0,kills:0},enemies:[{x:160,y:320,r:12,vx:-30,spiky:true,sucked:false}],boss:null};
 const g=readRecorderGame(target('Puff Gulp',{snapshot:()=>raw,debug:new Proxy({},{get(){throw Error('debug access');}})}),'puff');
 const {puffPlan}=await import('../scripts/mcp-publisher/visible-game-plans.mjs');
 assert.equal(puffPlan(g).release,true);
 assert.notEqual(puffPlan({...g,belly:0}).y,g.puff.y,'dodge when no ammo is available');
 const food={...g,belly:0,enemies:[{x:230,y:250,r:12,vx:-30,spiky:false,sucked:false}]};
 const c=createGameInputController('puff',size),events=[];for(let f=0;f<25;f++)events.push(...c.next(f,food));events.push(...c.next(25,g));
 assert.equal(events.at(-1).type,'touchEnd');assert.equal(assertSmooth(events,6).starts,1);assert.deepEqual(c.next(26,food),[],'release has a normal brief pause');
 raw.enemies[0].r=NaN;assert.equal(readRecorderGame(target('Puff Gulp',{snapshot:()=>raw}),'puff'),null);
});
