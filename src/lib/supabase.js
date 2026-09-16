import {createClient} from '@supabase/supabase-js';
import {API, ownerRequest, createOwnerScope, SlopError} from './contracts.js';
// This publishable key is intentionally public, matching the mobile app.
export const publicKey='sb_publishable_hR6MXJRNM9VuADkU8z-2mg_K9t7FBQL';
export const supabase=createClient(API,publicKey,{
  auth:{storageKey:'sb-api-auth-token',flowType:'pkce',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true},
});
let authSnapshot=null;let epoch=0;
export function syncSession(session){
  if(authSnapshot?.user?.id!==session?.user?.id)epoch++;
  authSnapshot=session?{...session,epoch}:null;
}
export const getSession=()=>authSnapshot;
export const request=ownerRequest({getSession,base:import.meta.env.DEV?'/api':'https://api.slop.game/functions/v1'});
export const mcpRequest=ownerRequest({getSession,base:import.meta.env?.DEV?'/api':'https://api.slop.game/functions/v1'});
export async function result(query){const {data,error}=await query;if(error)throw new SlopError(error.code,error.message);return data;}
// A delayed SDK request cannot pick up another account's token. Even switching
// away and back invalidates an operation, independently of token refreshes.
export const asOwner=createOwnerScope({getSession,
  clientFactory:accessToken=>createClient(API,publicKey,{accessToken}),
});
export const ownRpc=(name,params)=>asOwner((_owner,client)=>result(client.rpc(name,params)));
export function safeSignOut(){return supabase.auth.signOut({scope:'local'});}
