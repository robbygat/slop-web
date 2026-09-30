import {supabase, result, asOwner} from './supabase.js';
import {parseSocialActivity} from './social-activity-contracts.js';
import {PUBLIC_PROFILE_COLUMNS} from './profile-banners.js';
import {SlopError,UUID} from './contracts.js';
import {useCallback,useSyncExternalStore} from 'react';
import {createActivityUnreadStore} from './activity-unread-store.js';

const columns='id,recipient_id,actor_id,actor_name,kind,game_id,game_name,detail,conversation_id,metadata,read_at,created_at';
const legacyColumns='id,recipient_id,actor_id,actor_name,kind,game_id,game_name,detail,created_at';
const deadline = query => query.abortSignal(AbortSignal.timeout(10000));

export const loadSocialActivity = ({beforeId=null}={}) => asOwner(async(owner,client)=>{
  const page=(select)=>{
    let query=client.from('activity').select(select).eq('recipient_id',owner).order('id',{ascending:false}).limit(41);
    if(beforeId!==null){if(!Number.isSafeInteger(beforeId)||beforeId<=0)throw new SlopError('invalid_response');query=query.lt('id',beforeId);}
    return result(deadline(query));
  };
  let rows,canRead=true;
  try {rows=await page(columns);}
  catch(error){if(!['42703','PGRST204'].includes(error?.code))throw error;rows=await page(legacyColumns);canRead=false;}
  const parsed=parseSocialActivity(rows,owner),events=parsed.slice(0,40);
  const actorIds=[...new Set(events.map(event=>event.actorId).filter(Boolean))];
  const unreadRevision=canRead?unreadStore(owner).beginRead():null;
  const [profiles,unread]=await Promise.all([
    actorIds.length?result(deadline(client.from('profiles').select(PUBLIC_PROFILE_COLUMNS).in('id',actorIds))).catch(()=>[]):[],
    canRead?deadline(client.from('activity').select('id',{count:'exact',head:true}).eq('recipient_id',owner).is('read_at',null)).then(response=>response.error?null:response.count).catch(()=>null):null,
  ]);
  const byId=new Map(profiles.map(profile=>[profile.id,profile]));
  return {ownerId:owner,events:events.map(event=>{const profile=byId.get(event.actorId);return profile?{...event,profile,actorName:profile.username||event.actorName}:event;}),
    next:parsed.length>40?events.at(-1)?.id:null,canRead,unread,unreadRevision};
}).then(snapshot=>{unreadStore(snapshot.ownerId).publishAt(snapshot.unread,snapshot.unreadRevision);return snapshot;});

export const markSocialActivityRead = throughId => asOwner((_owner,client)=>{
  if(!Number.isSafeInteger(throughId)||throughId<=0)throw new SlopError('invalid_response');
  return result(deadline(client.rpc('mark_activity_read',{p_through_id:throughId})));
});

// Realtime only prompts an owner-scoped reload; raw event snapshots never enter
// the UI, and subscribing does not register browser or mobile push permissions.
const hubs=new Map();
export function subscribeSocialActivity(ownerId, onChange) {
  if(!UUID.test(ownerId))return()=>{};
  let hub=hubs.get(ownerId);
  if(!hub){
    hub={listeners:new Set(),channel:null};hubs.set(ownerId,hub);
    hub.channel=supabase.channel(`web-social-activity:${ownerId}`).on('postgres_changes',{
      event:'*',schema:'public',table:'activity',filter:`recipient_id=eq.${ownerId}`,
    },()=>{for(const listener of hub.listeners)listener();}).subscribe();
  }
  hub.listeners.add(onChange);
  return()=>{hub.listeners.delete(onChange);if(!hub.listeners.size){hubs.delete(ownerId);void supabase.removeChannel(hub.channel);}};
}

const unreadStores=new Map(),guestSnapshot={unread:0,loading:false,error:null};
function unreadStore(ownerId) {
  if(!unreadStores.has(ownerId))unreadStores.set(ownerId,createActivityUnreadStore({
    load:()=>asOwner(async(owner,client)=>{
      if(owner!==ownerId)throw new SlopError('account_changed');
      const response=await deadline(client.from('activity').select('id',{count:'exact',head:true}).eq('recipient_id',owner).is('read_at',null));
      if(response.error)throw new SlopError(response.error.code,response.error.message);
      return response.count;
    }),
    start:refresh=>{
      const resume=()=>{if(!document.hidden)void refresh();};
      const unsubscribe=subscribeSocialActivity(ownerId,resume),timer=setInterval(resume,60000);
      window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
      return()=>{unsubscribe();clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
    },
  }));
  return unreadStores.get(ownerId);
}
// Header and Social share an account-scoped unread count and one Realtime
// channel. A released account invalidates in-flight reads before a new login.
export function useActivityUnread(ownerId) {
  const valid=UUID.test(ownerId);
  const subscribe=useCallback(listener=>{
    if(!valid)return()=>{};
    return unreadStore(ownerId).subscribe(listener);
  },[ownerId,valid]);
  const getSnapshot=useCallback(()=>valid?unreadStore(ownerId).getSnapshot():guestSnapshot,[ownerId,valid]);
  return useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
}
