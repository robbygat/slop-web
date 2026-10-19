import {GAMES} from './contracts.js';

export const isTurnGame=game=>game?.multiplayer_protocol==='turns-v1';
export function matchSnapshot(raw,game){
 if(!raw||raw.protocol!=='turns-v1'||raw.game_id!==game.id||raw.game_slug!==game.slug||!/^[A-Z0-9]{6,12}$/.test(raw.code)||
    !/^[a-f0-9]{64}$/.test(raw.release_digest)||raw.release_path!==`releases/${raw.release_digest}/${game.slug}`||
    !Number.isSafeInteger(raw.epoch)||raw.epoch<1||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.revision>256||
    ![0,1].includes(raw.seat)||!['waiting','active','complete'].includes(raw.status)||!Array.isArray(raw.actions)||raw.actions.length!==raw.revision||
    raw.actions.some((action,index)=>action.revision!==index+1||action.seat!==index%2||!action.action||typeof action.action!=='object'))throw new Error('Invalid match snapshot.');
 return {...raw,room:raw.code,gameId:raw.game_id,gameSlug:raw.game_slug,releaseDigest:raw.release_digest,releasePath:raw.release_path,
  rematchVotes:raw.rematch_votes,expiresAt:raw.expires_at,actions:raw.actions.map(action=>({...action,actionId:action.action_id}))};
}
export function matchEntry(snapshot){return `${GAMES}${snapshot.releasePath}/1.0.0/index.html`;}
export function validMatchEvent(event){
 if(event?.type==='match-ready')return true;
 if(!['match-submit','match-rematch'].includes(event?.type)||typeof event.requestId!=='string'||!/^[A-Za-z0-9_-]{1,96}$/.test(event.requestId)||!Number.isSafeInteger(event.epoch)||event.epoch<1)return false;
 if(event.type==='match-rematch')return true;
 return typeof event.actionId==='string'&&/^[A-Za-z0-9_-]{8,96}$/.test(event.actionId)&&Number.isSafeInteger(event.expectedRevision)&&event.expectedRevision>=0&&
  event.action&&typeof event.action==='object'&&!Array.isArray(event.action)&&new TextEncoder().encode(JSON.stringify(event.action)).length<=2048;
}
// One host-owned room per mounted player. Auth scope and immutable release are
// fixed when the owner creates/joins; authored code cannot supply either.
export function createTurnMatch({game,initial,rpc,currentScope,onError=()=>{},pollMs=1500}){
 let snapshot=matchSnapshot(initial,game),closed=false,timer=null,refreshing=null;
 const scope=currentScope(),listeners=new Set();
 const current=()=>!closed&&scope===currentScope();
 const guard=()=>{if(!current())throw Object.assign(new Error('Account or player changed.'),{code:'account_changed'});};
 function accept(raw){
  guard();const next=matchSnapshot(raw,game);
  if(next.room!==snapshot.room||next.seat!==snapshot.seat||next.releaseDigest!==snapshot.releaseDigest)throw new Error('Match identity changed.');
  if(next.epoch<snapshot.epoch||next.epoch===snapshot.epoch&&next.revision<snapshot.revision)return snapshot;
  snapshot=next;listeners.forEach(fn=>fn(snapshot));return snapshot;
 }
 async function refresh(){
  guard();if(refreshing)return refreshing;
  refreshing=Promise.resolve().then(()=>rpc('mp_turn_snapshot',{p_code:snapshot.room})).then(accept).finally(()=>{refreshing=null;});return refreshing;
 }
 async function poll(){
  if(!current())return;
  try{await refresh();}catch(error){if(current())onError(error);}
  if(current())timer=setTimeout(poll,pollMs);
 }
 const api={snapshot:()=>snapshot,entry:()=>matchEntry(snapshot),current,
  subscribe(fn){listeners.add(fn);fn(snapshot);return()=>listeners.delete(fn);},
  start(){if(timer===null){timer=setTimeout(poll,pollMs);}},
  close(){closed=true;clearTimeout(timer);listeners.clear();},
  refresh,
  async rematch(){guard();return accept(await rpc('mp_turn_rematch',{p_code:snapshot.room,p_epoch:snapshot.epoch}));},
  async handle(event,send){
   if(!validMatchEvent(event)||!current())return;
   if(event.type==='match-ready'){send({type:'match-snapshot',snapshot});return;}
   try{
    if(event.epoch!==snapshot.epoch)throw Object.assign(new Error('Round changed.'),{code:'stale_epoch'});
    const raw=event.type==='match-rematch'?await rpc('mp_turn_rematch',{p_code:snapshot.room,p_epoch:event.epoch}):await rpc('mp_turn_submit',{
     p_code:snapshot.room,p_epoch:event.epoch,p_expected_revision:event.expectedRevision,p_action_id:event.actionId,p_action:event.action});
    const value=accept(raw);guard();send({type:'match-response',requestId:event.requestId,snapshot:value});
   }catch(error){if(current()){send({type:'match-response',requestId:event.requestId,error:{code:error.code||'match_request_failed'}});try{await refresh();}catch{}}}
  }
 };return api;
}
