import React,{createContext,useContext,useEffect,useState} from 'react';
import {supabase,syncSession,result,safeSignOut} from './lib/supabase.js';
import {pendingPairing,oauthCallbackUrl} from './lib/pairing-contracts.js';
import {Button,Modal,Notice,Slop} from './components/ui.jsx';
const AuthContext=createContext(null);
// Capture the arrival URL before the SDK removes the one-time PKCE code.
const arrivedViaOAuth=oauthCallbackUrl(window.location.href);
export const useAuth=()=>useContext(AuthContext);
export function AuthProvider({children}){
 const[session,setSession]=useState(null),[ready,setReady]=useState(false),[profile,setProfile]=useState(null),[login,setLogin]=useState(false),[profileVersion,setProfileVersion]=useState(0);
 useEffect(()=>{
  let alive=true;let eventSeen=false;
  let pairingReturned=false;
  const apply=(s,event)=>{syncSession(s);setSession(s);setReady(true);
   if(arrivedViaOAuth&&!pairingReturned&&s?.user&&!s.user.is_anonymous&&['SIGNED_IN','INITIAL_SESSION'].includes(event)){
    pairingReturned=true;
    try{if(pendingPairing(sessionStorage.getItem('slop.pending-pair.v1')))window.location.hash='/connect';}catch{}
   }
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{eventSeen=true;if(alive)apply(s,event);});
  supabase.auth.getSession().then(({data})=>{if(alive&&!eventSeen)apply(data.session);});
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{let alive=true;setProfile(null);if(session?.user?.id)result(supabase.from('profiles').select('id,username,display_name,avatar_url,bio,slop_look,profile_banner_id').eq('id',session.user.id).maybeSingle()).then(p=>{if(alive)setProfile(p);}).catch(()=>{});return()=>{alive=false;};},[session?.user?.id,profileVersion]);
 useEffect(()=>{if(session&&!session.user.is_anonymous)setLogin(false);},[session]);
 const user=session&&!session.user.is_anonymous?session.user:null;
 return <AuthContext value={{user,session,ready,profile,refreshProfile:()=>setProfileVersion(v=>v+1),signIn:()=>setLogin(true),requireAuth:()=>{if(user)return true;setLogin(true);return false;},signOut:safeSignOut}}>{children}{login&&<AuthDialog onClose={()=>setLogin(false)}/>}</AuthContext>;
}
export function AuthDialog({onClose}){
 const[mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const redirectTo=window.location.origin+'/';
 async function action(work){setBusy(true);setError(null);setMessage('');try{const {error}=await work();if(error)throw error;}catch(e){setError(e);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();await action(async()=>{
  if(mode==='signup'){const r=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});if(!r.error)setMessage('Check your email to confirm your account, then come back here.');return r;}
  if(mode==='reset'){const r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirectTo+'#/settings?reset=1'});if(!r.error)setMessage('If an account exists, a reset link is on its way.');return r;}
  const r=await supabase.auth.signInWithPassword({email,password});if(!r.error)onClose();return r;
 });}
 return <Modal title="Welcome to Slop" onClose={onClose} className="auth-modal"><Slop body="heart" color="bubblegum" alt=""/><p className="muted">Sign in with your mobile account. Your games, creations and Slop stay together.</p>
  {mode!=='reset'&&<><div className="oauth-actions"><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo}}))}>Continue with Google</Button><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'apple',options:{redirectTo}}))}>Continue with Apple</Button></div><div className="divider"><span>or use email</span></div></>}
  <form onSubmit={submit}><label>Email address<input type="email" name="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>{mode!=='reset'&&<label>Password<input type="password" name="password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}<Notice error={error}/>{message&&<p className="success" role="status">{message}</p>}<Button className="full" disabled={busy} type="submit">{busy?'One moment…':mode==='signin'?'Sign in':mode==='signup'?'Create your account':'Send reset link'}</Button></form>
  <div className="auth-options"><button className="text-button" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setError(null);setMessage('');}}>{mode==='signup'?'Already have an account? Sign in':'New here? Join Slop'}</button>{mode==='signin'&&<button className="text-button" onClick={()=>setMode('reset')}>Forgot password?</button>}</div><p className="fine">By continuing, you agree to our <a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.</p>
 </Modal>;
}
