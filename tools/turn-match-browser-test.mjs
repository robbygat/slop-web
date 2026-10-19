// Real web host controller and canonical SDK; RPC is an in-memory authority.
// No Slop service is contacted. PUPPETEER_MODULE may point to an installed ESM entry.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE?pathToFileURL(resolve(process.env.PUPPETEER_MODULE)).href:'puppeteer-core');
const runtime=await readFile(resolve(root,'mcp/runtime/multiplayer-v1.js'),'utf8');
const game={id:'tankfall',slug:'tankfall'},digest='a'.repeat(64);
let state={protocol:'turns-v1',code:'TEST1234',game_id:game.id,game_slug:game.slug,release_digest:digest,release_path:'releases/'+digest+'/'+game.slug,epoch:1,revision:0,seed:'browser',status:'active',turn:0,players:[true,true],actions:[],rematch_votes:[false,false]};
let calls=0;
const snapshot=seat=>structuredClone({...state,seat});
async function rpc(seat,name,args){
 await new Promise(resolve=>setTimeout(resolve,200));calls++;
 assert.equal(args.p_code,state.code);
 if(name==='mp_turn_submit'){
  if(args.p_epoch!==state.epoch||args.p_expected_revision!==state.revision)throw new Error('stale_revision');
  if(seat!==state.turn)throw new Error('not_your_turn');
  state.actions.push({revision:++state.revision,seat,action_id:args.p_action_id,action:args.p_action});state.turn=state.revision%2;
 }else if(name==='mp_turn_rematch'){
  assert.equal(args.p_epoch,state.epoch);state.rematch_votes[seat]=true;
  if(state.rematch_votes.every(Boolean))state={...state,epoch:state.epoch+1,revision:0,turn:0,actions:[],rematch_votes:[false,false]};
 }else assert.equal(name,'mp_turn_snapshot');
 return snapshot(seat);
}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Turn host test</title><iframe sandbox="allow-scripts" style="width:420px;height:660px;border:0"></iframe>');return;}
  const path=resolve(root,'.'+url.pathname),name=relative(root,path);
  if(name.startsWith('..')||!name.startsWith('src')||extname(path)!=='.js'){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(path));
 }catch{res.writeHead(500);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const pages=[],frames=[],errors=[];
 async function initialize(page,seat){
  await page.goto(origin);
  await page.evaluate(async({game,initial,runtime})=>{
   const {createTurnMatch}=await import('/src/lib/turn-match.js');
   const {acceptPlayerEvent}=await import('/src/lib/player-contracts.js');
   const frame=document.querySelector('iframe');window.scope=1;
   const host=createTurnMatch({game,initial,rpc:window.testRpc,currentScope:()=>window.scope,pollMs:80});window.host=host;
   const send=message=>frame.contentWindow.postMessage(JSON.stringify(message),'*');
   addEventListener('message',event=>{const message=acceptPlayerEvent(event.source,frame.contentWindow,event.data);if(message?.type.startsWith('match-'))void host.handle(message,send);});
   host.subscribe(snapshot=>send({type:'match-snapshot',snapshot}));host.start();
   const authored="window.restarts=0;Slop.onRestart(()=>{window.restarts++;});Slop.match.subscribe(snapshot=>{window.latest=snapshot;});const surface=Slop.create();Slop.loop(()=>{surface.ctx.fillRect(0,0,10,10);Slop.ready();});";
   frame.srcdoc='<!doctype html><body><script>window.__slopMatchExpected=true;</script><script>'+runtime+'</script><script>'+authored+'</script>';
  },{game,initial:snapshot(seat),runtime});
  const frame=page.frames().find(frame=>frame.parentFrame());
  try{await frame.waitForFunction(()=>window.latest&&window.__slopOperationalReady===true,{timeout:10000});}
  catch(error){console.error(JSON.stringify({errors,child:await frame.evaluate(()=>({sdk:window.Slop?.version,ready:window.__slopOperationalReady,snapshot:window.Slop?.match?.snapshot(),html:document.body.innerHTML.slice(0,100)}))}));throw error;}return frame;
 }
 for(let seat=0;seat<2;seat++){
  const context=await browser.createBrowserContext(),page=await context.newPage();pages.push(page);
  page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('testRpc',(name,args)=>rpc(seat,name,args));
  frames.push(await initialize(page,seat));
 }
 const submit=(frame,id)=>frame.evaluate(async actionId=>{const snapshot=Slop.match.snapshot();return Slop.match.submit({actionId,epoch:snapshot.epoch,expectedRevision:snapshot.revision,action:{angle:45,power:.6}});},id);
 await submit(frames[0],'shot_0001');await frames[1].waitForFunction(()=>window.latest.revision===1);
 const failure=await frames[0].evaluate(async()=>{const s=Slop.match.snapshot();try{await Slop.match.submit({actionId:'shot_bad1',epoch:s.epoch,expectedRevision:s.revision,action:{angle:40,power:.5}});return null;}catch(error){return error.code;}});assert.equal(failure,'match_request_failed');
 await submit(frames[1],'shot_0002');await frames[0].waitForFunction(()=>window.latest.revision===2);
 assert.deepEqual(await frames[0].evaluate(()=>window.latest.actions),await frames[1].evaluate(()=>window.latest.actions));
 frames[1]=await initialize(pages[1],1);assert.equal(await frames[1].evaluate(()=>window.latest.revision),2);
 await Promise.all(frames.map(frame=>frame.evaluate(()=>Slop.match.rematch())));
 await Promise.all(frames.map(frame=>frame.waitForFunction(()=>window.latest.epoch===2&&window.latest.revision===0)));
 assert.equal(await frames[0].evaluate(()=>window.restarts),1);assert.equal(await frames[1].evaluate(()=>window.restarts),1);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,browsers:2,rpcDelayMs:200,acceptedTurns:2,reconnect:true,rematchEpoch:2,rpcCalls:calls}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
