const forbidden=()=>{globalThis.__worldsQaForbidden=(globalThis.__worldsQaForbidden||0)+1;throw Error('LOCAL QA forbids all backend/account operations.');};
export const getSession=()=>null,getSessionEpoch=()=>0,onSessionScope=()=>()=>{};
export const ownRpc=forbidden,asOwner=forbidden,result=forbidden,request=forbidden,mcpRequest=forbidden;
export const syncSession=forbidden,safeSignOut=forbidden,verifySession=forbidden,onInvalidSession=()=>()=>{};
export const publicKey='local-only-no-key';
export const supabase={rpc:forbidden,from:forbidden,auth:new Proxy({},{get:()=>forbidden})};
