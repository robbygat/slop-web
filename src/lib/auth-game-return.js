import {SLUG} from './contracts.js';

export const GAME_AUTH_RETURN_KEY='slop.game-auth-return.v1';
const TTL=10*60_000;
const browserStorage=()=>{try{return globalThis.sessionStorage;}catch{return null;}};
const validRoute=route=>typeof route==='string'&&/^\/home\?game=[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(route);

// The selected game can live in a modal without being in the URL. Reopen it
// through the existing Home deep link after OAuth; never persist account data.
export function gameAuthReturnRoute(gameSlug){
 return typeof gameSlug==='string'&&SLUG.test(gameSlug)?'/home?game='+gameSlug:null;
}
export function clearGameAuthReturn({storage=browserStorage()}={}){
 try{storage?.removeItem(GAME_AUTH_RETURN_KEY);}catch{}
}
export function saveGameAuthReturn(route,{storage=browserStorage(),now=Date.now()}={}){
 clearGameAuthReturn({storage});
 if(!validRoute(route)||!Number.isFinite(now))return false;
 try{if(!storage)return false;storage.setItem(GAME_AUTH_RETURN_KEY,JSON.stringify({version:1,route,at:now}));return true;}catch{return false;}
}
export function consumeGameAuthReturn({preferredRoute=null,storage=browserStorage(),now=Date.now()}={}){
 let route=null;
 try{
  const raw=storage?.getItem(GAME_AUTH_RETURN_KEY);
  // Consume even if a pairing or build callback takes priority.
  storage?.removeItem(GAME_AUTH_RETURN_KEY);
  const value=JSON.parse(raw);
  if(value?.version===1&&validRoute(value.route)&&Number.isFinite(value.at)&&value.at<=now&&now-value.at<=TTL)route=value.route;
 }catch{}
 return preferredRoute||route;
}
