import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredInputTitle,identifyGameInput,readRecorderGame,installGameObservation,createGameInputController,continuousGameInput} from '../scripts/mcp-publisher/game-input.mjs';
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
