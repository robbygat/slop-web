import {PersistentStore} from './persist-store.js';
import {PersistentSession} from './persist-session.js';
import {activeRun, persistentLineage} from './persist-contracts.js';
import {claimPersistentDeviceSaves} from './persist-claim.js';
import {getSession, getSessionEpoch, onSessionScope, ownRpc} from './supabase.js';

const listeners = new Set(), players = new Set();
let broadcast;
const notify = () => { for (const listener of listeners) listener(); };
if (typeof BroadcastChannel !== 'undefined') {
  broadcast = new BroadcastChannel('slop-persistent-changed-v1');
  broadcast.onmessage = notify; // No save/account data is broadcast.
}
export const persistentStore = new PersistentStore({onChange: () => { notify(); broadcast?.postMessage('changed'); }});
export const persistentScope = () => {
  const user = getSession()?.user;
  return {owner: user && !user.is_anonymous ? `account:${user.id}` : 'device', epoch: getSessionEpoch()};
};
export function watchPersistentSaves(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export async function hasDeviceRun(game) {
  const scope = persistentScope();
  const row = await persistentStore.read(scope.owner, persistentLineage(game), 'run');
  return scope.owner === persistentScope().owner && scope.epoch === persistentScope().epoch && activeRun(row);
}
export function createPersistentSession(game, {send, onState, preview=false}) {
  const currentScope=()=>{const scope=persistentScope();return {...scope,owner:preview?`${scope.owner}:preview`:scope.owner};};
  const scope = currentScope();
  const session = new PersistentSession({store: persistentStore, game: persistentLineage(game), ...scope, currentScope,
    rpc: preview || scope.owner === 'device' ? null : (name, params) => { session.assertCurrent(); return ownRpc(name, params); }, send, onState});
  const retire = onSessionScope(() => {
    if (!session.current()) { onState({retired: true, error: new Error('Your account changed. Reopen this Slop World to continue with that account.')}); session.dispose(); }
  });
  const online = () => session.reconnect();
  const hidden = () => { if (document.hidden) void session.flush().catch(() => {}); else session.reconnect(); };
  const pagehide = () => { void session.flush().catch(() => {}); };
  window.addEventListener('online', online); document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
  players.add(session);
  const dispose = session.dispose.bind(session);
  session.dispose = () => { retire(); players.delete(session); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide); dispose(); };
  return session;
}
// Explicit in-app exits wait for the final local checkpoint. Browser/OS kill
// cannot wait: SDK heartbeat + visibility/pagehide retain the last durable save.
export async function flushPersistentPlayers() { await Promise.all([...players].map(session => session.flush())); }

let claiming = null;
export function claimDeviceSaves() {
  const captured = persistentScope();
  if (captured.owner === 'device') return Promise.resolve();
  if (claiming?.owner === captured.owner && claiming?.epoch === captured.epoch) return claiming.promise;
  const current = () => { const live = persistentScope(); if (live.owner !== captured.owner || live.epoch !== captured.epoch) throw new Error('Account changed during save transfer.'); };
  const promise = claimPersistentDeviceSaves({store:persistentStore,owner:captured.owner,assertCurrent:current,rpc:async(name,params)=>{
    current();let timer;
    try{return await Promise.race([ownRpc(name,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Save transfer is offline. Device progress is kept.')),8000);})]);}
    finally{clearTimeout(timer);}
  }});
  claiming = {...captured, promise};
  return promise.finally(() => { if (claiming?.promise === promise) claiming = null; });
}
