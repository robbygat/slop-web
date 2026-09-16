import React,{createContext,useContext,useEffect,useState} from 'react';
import {supabase,syncSession,result,safeSignOut,verifySession,onInvalidSession,getSession} from './lib/supabase.js';
import {createSessionResolver,pendingAuthReturn} from './lib/session-contracts.js';
import {BUILD_IDEA_KEY} from './lib/build-draft.js';
import {oauthCallbackUrl} from './lib/pairing-contracts.js';
import {Button,Modal,Notice,Slop} from './components/ui.jsx';
const AuthContext=createContext(null);
// Capture the arrival URL before the SDK removes the one-time PKCE code.
const arrivedViaOAuth=oauthCallbackUrl(window.location.href)&&!/^#\/settings(?:\?|$)/.test(window.location.hash);
export const useAuth=()=>useContext(AuthContext);
export function AuthProvider({children}){
 const[session,setSession]=useState(null),[ready,setReady]=useState(false),[profile,setProfile]=useState(null),[login,setLogin]=useState(false),[profileVersion,setProfileVersion]=useState(0),[authError,setAuthError]=useState(null),[sessionEnded,setSessionEnded]=useState(false);
 useEffect(()=>{
  let alive=true,eventSeen=false,pairingReturned=false;
  const apply=(s,event)=>{if(!alive)return;syncSession(s);setSession(s);setReady(true);setAuthError(null);
   if(s)setSessionEnded(false);
   if(arrivedViaOAuth&&!pairingReturned&&s?.user&&!s.user.is_anonymous&&['SIGNED_IN','INITIAL_SESSION','SESSION_CHECK','TOKEN_REFRESHED'].includes(event)){
    pairingReturned=true;
    try{const route=pendingAuthReturn({pairing:sessionStorage.getItem('slop.pending-pair.v1'),idea:sessionStorage.getItem(BUILD_IDEA_KEY),ownerId:s.user.id});if(route)window.location.hash=route;}catch{}
   }
  };
  const expired=()=>{if(!alive)return;syncSession(null);setSession(null);setProfile(null);setReady(true);setAuthError(null);setSessionEnded(true);setLogin(true);};
  const resolver=createSessionResolver({verify:verifySession,
   onPending:s=>{if(getSession()?.user?.id!==s.user?.id){syncSession(null);setSession(null);setProfile(null);setReady(false);}},
   onVerified:apply,onInvalid:expired,
   onUnavailable:error=>{if(!alive)return;syncSession(null);setSession(null);setProfile(null);setReady(true);setAuthError(error);},
  });
  const removeInvalid=onInvalidSession(()=>{resolver.cancel();expired();});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{eventSeen=true;if(alive)void resolver.accept(s,event);});
  const refresh=()=>resolver.read(async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session;});
  supabase.auth.getSession().then(({data,error})=>{if(alive&&!eventSeen){if(error){setAuthError(error);setReady(true);}else void resolver.accept(data.session,'INITIAL_SESSION');}});
  window.addEventListener('online',refresh);
  const focus=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',focus);
  return()=>{alive=false;resolver.cancel();removeInvalid();subscription.unsubscribe();window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',focus);};
 },[]);
 useEffect(()=>{let alive=true;setProfile(null);if(session?.user?.id)result(supabase.from('profiles').select('id,username,display_name,avatar_url,bio,slop_look,profile_banner_id').eq('id',session.user.id).maybeSingle()).then(p=>{if(alive)setProfile(p);}).catch(()=>{});return()=>{alive=false;};},[session?.user?.id,profileVersion]);
 useEffect(()=>{if(session&&!session.user.is_anonymous)setLogin(false);},[session]);
 const user=session&&!session.user.is_anonymous?session.user:null;
 return <AuthContext value={{user,session,ready,profile,refreshProfile:()=>setProfileVersion(v=>v+1),signIn:()=>setLogin(true),requireAuth:()=>{if(user)return true;setLogin(true);return false;},signOut:safeSignOut}}>{authError&&<Notice error={authError} onRetry={()=>window.location.reload()}/>}{children}{login&&<AuthDialog sessionEnded={sessionEnded} onClose={()=>setLogin(false)}/>}</AuthContext>;
}
export function AuthDialog({onClose,sessionEnded=false}){
 const[mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const redirectTo=window.location.origin+'/';
 async function action(work){setBusy(true);setError(null);setMessage('');try{const {error}=await work();if(error)throw error;}catch(e){setError(e);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();await action(async()=>{
  if(mode==='signup'){const r=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});if(!r.error)setMessage('Check your email to confirm your account, then come back here.');return r;}
  if(mode==='reset'){const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirectTo+'#/settings?reset=1'});if(!r.error)setMessage('If an account exists, a reset link is on its way.');return r;}
  const r=await supabase.auth.signInWithPassword({email,password});if(!r.error)onClose();return r;
 });}
 return <Modal title="Welcome to Slop" onClose={onClose} className="auth-modal"><Slop body="heart" color="bubblegum" alt=""/><p className="muted">{sessionEnded?'Your session ended. Sign in again to continue.':'Sign in with your mobile account.'} Your games, creations and Slop stay together.</p>
  {mode!=='reset'&&<><div className="oauth-actions"><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo}}))}>Continue with Google</Button><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'apple',options:{redirectTo}}))}>Continue with Apple</Button></div><div className="divider"><span>or use email</span></div></>}
  <form onSubmit={submit}><label>Email address<input type="email" name="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>{mode!=='reset'&&<label>Password<input type="password" name="password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}<Notice error={error}/>{message&&<p className="success" role="status">{message}</p>}<Button className="full" disabled={busy} type="submit">{busy?'One moment…':mode==='signin'?'Sign in':mode==='signup'?'Create your account':'Send reset link'}</Button></form>
  <div className="auth-options"><button className="text-button" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setError(null);setMessage('');}}>{mode==='signup'?'Already have an account? Sign in':'New here? Join Slop'}</button>{mode==='signin'&&<button className="text-button" onClick={()=>setMode('reset')}>Forgot password?</button>}</div><p className="fine">By continuing, you agree to our <a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.</p>
 </Modal>;
}
