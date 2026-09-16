import {API,boundedJson,SlopError} from './contracts.js';
import {pendingPairing} from './pairing-contracts.js';
import {pendingBuildRoute} from './build-draft.js';

// A stored JWT can remain unexpired after its auth.users row is deleted.
// Verify the actual account before exposing its owner-bound app capabilities.
export function createSessionVerifier({publicKey,fetcher=fetch,now=Date.now,cacheMs=30000}){
 let cached=null;const pending=new Map();
 return async(session,{force=false}={})=>{
  if(!session?.user?.id||!session.access_token)throw new SlopError('authentication_required');
  const token=session.access_token;
  if(!force&&cached?.token===token&&cached.until>now()){if(cached.user.id!==session.user.id)throw new SlopError('authentication_required');return {...session,user:cached.user};}
  let work=pending.get(token);
  if(!work){
   work=(async()=>{
    let response;
    try{response=await fetcher(`${API}/auth/v1/user`,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{apikey:publicKey,Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(15000)});}
    catch{throw new SlopError('service_unavailable');}
    if(!response.ok){
     let failure;try{failure=await boundedJson(response,128*1024);}catch{throw new SlopError('service_unavailable');}
     const code=typeof failure?.code==='string'?failure.code:failure?.error_code;
     const rejected=['bad_jwt','user_not_found','session_not_found','session_expired','user_banned'].includes(code)||(response.status===401&&!/api.?key/i.test(failure?.message||failure?.msg||''));
     if([401,403,404].includes(response.status)&&rejected){if(cached?.token===token)cached=null;throw new SlopError('authentication_required');}
     throw new SlopError('service_unavailable');
    }
    const user=await boundedJson(response,128*1024);
    if(user?.id!==session.user.id)throw new SlopError('authentication_required');
    cached={token,user,until:now()+cacheMs};return user;
   })();pending.set(token,work);
   work.finally(()=>{if(pending.get(token)===work)pending.delete(token);}).catch(()=>{});
  }
  const user=await work;if(user.id!==session.user.id)throw new SlopError('authentication_required');return {...session,user};
 };
}

const sameOwner=(a,b)=>a?.user?.id===b?.user?.id&&a?.epoch===b?.epoch;
export const mayBeExpiredSession=error=>error?.status===401||['PGRST301','PGRST302','PGRST303'].includes(error?.code)||(error?.code==='23503'&&/slop_cosmetic_entitlements_user_id_fkey/.test(error.message||''));
export function createVerifiedOwnerGuard({getSession,verify,invalidate}){
 return async work=>{
  const owner=getSession();
  if(!owner?.user?.id||owner.user.is_anonymous||!owner.access_token)throw new SlopError('authentication_required');
  const assertOwner=()=>{if(!sameOwner(getSession(),owner))throw new SlopError('account_changed');};
  const check=async force=>{
   try{await verify(owner,{force});assertOwner();}
   catch(error){assertOwner();if(error?.code==='authentication_required'){if(getSession()?.access_token!==owner.access_token)throw new SlopError('account_changed','Your session refreshed. Please try again.');invalidate(owner);}throw error;}
  };
  await check(false);
  try{const data=await work();assertOwner();return data;}
  catch(error){assertOwner();if(mayBeExpiredSession(error))await check(true);throw error;}
 };
}

// Auth events can finish verification out of order. A late response must never
// restore a signed-out user or clear the account selected by a newer event.
export function createSessionResolver({verify,onPending,onVerified,onInvalid,onUnavailable}){
 let revision=0;
 const resolver={cancel(){revision++;},async accept(session,event){
  const ticket=++revision;
  if(!session){onVerified(null,event);return;}
  if(!session.user?.id||!session.access_token){onInvalid(session);return;}
  onPending(session);
  try{const verified=await verify(session,{force:true});if(ticket===revision)onVerified(verified,event);}
  catch(error){if(ticket!==revision)return;if(error?.code==='authentication_required')onInvalid(session);else onUnavailable(error);}
 },async read(load,event='SESSION_CHECK'){
  const ticket=revision;
  try{const session=await load();if(ticket===revision)return resolver.accept(session,event);}
  catch(error){if(ticket===revision)onUnavailable(error);}
 }};
 return resolver;
}

export function pendingAuthReturn({pairing,idea,ownerId,now=Date.now()}){
 if(pendingPairing(pairing,now))return '/connect';
 return pendingBuildRoute(idea,ownerId,now);
}
