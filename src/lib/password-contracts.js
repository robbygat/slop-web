import {API,boundedJson,SlopError} from './contracts.js';

export function createPasswordUpdater({getSession,publicKey,fetcher=fetch}) {
  return async password=>{
    const owner=getSession();
    if(!owner?.user?.id||owner.user.is_anonymous||!owner.access_token)throw new SlopError('authentication_required');
    if(typeof password!=='string'||password.length<8||password.length>256)throw new Error('Use a password between 8 and 256 characters.');
    const assertOwner=()=>{const current=getSession();if(current?.epoch!==owner.epoch||current?.user?.id!==owner.user.id)throw new SlopError('account_changed');};
    try {
      assertOwner();
      // Pin identity at invocation. The shared Auth SDK can acquire its lock
      // after another tab has replaced the current account's stored session.
      const response=await fetcher(`${API}/auth/v1/user`,{
        method:'PUT',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{apikey:publicKey,Authorization:`Bearer ${owner.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({password}),signal:AbortSignal.timeout(30000),
      });
      assertOwner();const data=await boundedJson(response,128*1024);assertOwner();
      if(!response.ok)throw new Error(response.status===422?'Choose a stronger password and try again.':'Your password could not be updated. Sign in again and retry.');
      if(data?.id!==owner.user.id)throw new SlopError('account_changed');
      return data;
    }catch(error){assertOwner();throw error;}
  };
}
