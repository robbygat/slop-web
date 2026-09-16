import {UUID} from './contracts.js';
export const validRestartAck = event => event?.type==='restart-ack' && typeof event.request==='string' && UUID.test(event.request) && typeof event.handled==='boolean';

// A single requested restart belongs to one exact iframe. Late replies from a
// replaced game or earlier round cannot reset score authority for the next one.
export function createRestartGate({schedule=setTimeout,cancelTimer=clearTimeout,requestId=()=>crypto.randomUUID(),timeoutMs=900}={}) {
 let pending=null;
 function cancel(){if(pending){cancelTimer(pending.timer);pending=null;}}
 function finish(attempt,handled){if(pending!==attempt)return false;cancel();(handled?attempt.onHandled:attempt.onFallback)();return true;}
 return {
  get pending(){return pending!==null;},
  begin({frame,onHandled,onFallback}){
   if(pending||!frame)return null;
   const request=requestId();if(!UUID.test(request))throw new Error('Invalid restart request');
   const attempt={frame,request,onHandled,onFallback};pending=attempt;
   attempt.timer=schedule(()=>finish(attempt,false),timeoutMs);
   return request;
  },
  receive(source,event){const attempt=pending;if(!attempt||source!==attempt.frame||!validRestartAck(event)||event.request!==attempt.request)return false;return finish(attempt,event.handled);},
  fail(source){return pending&&source===pending.frame?finish(pending,false):false;},
  cancel,
 };
}
