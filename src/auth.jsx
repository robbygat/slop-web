import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {supabase,syncSession,result,safeSignOut,verifySession,onInvalidSession,getSession} from './lib/supabase.js';
import {createSessionResolver,pendingAuthReturn} from './lib/session-contracts.js';
import {BUILD_IDEA_KEY} from './lib/build-draft.js';
import {oauthCallbackUrl} from './lib/pairing-contracts.js';
import {claimDeviceSaves} from './lib/persist-runtime.js';
import {Button,Modal,Notice} from './components/ui.jsx';
import {Icon} from './components/Icon.jsx';
import RobotPortrait from './components/RobotPortrait.jsx';
import './components/auth-dialog.css';
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
 useEffect(()=>{if(ready&&session?.user&&!session.user.is_anonymous)void claimDeviceSaves().catch(()=>{});},[ready,session?.user?.id]);
 const user=session&&!session.user.is_anonymous?session.user:null;
 return <AuthContext value={{user,session,ready,profile,refreshProfile:()=>setProfileVersion(v=>v+1),signIn:()=>setLogin(true),requireAuth:()=>{if(user)return true;setLogin(true);return false;},signOut:safeSignOut}}>{authError&&<Notice error={authError} onRetry={()=>window.location.reload()}/>}{children}{login&&<AuthDialog sessionEnded={sessionEnded} onClose={()=>setLogin(false)}/>}</AuthContext>;
}
export function AuthDialog({onClose,sessionEnded=false}){
 const[mode,setMode]=useState('signin'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[error,setError]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const redirectTo=window.location.origin+'/';
 function changeMode(value){if(pending.current)return;setMode(value);setError(null);setMessage('');setShowPassword(false);}
 async function action(work){if(pending.current)return;pending.current=true;setBusy(true);setError(null);setMessage('');try{const {error}=await work();if(error)throw error;}catch(e){if(alive.current)setError(e);}finally{pending.current=false;if(alive.current)setBusy(false);}}
 async function submit(e){e.preventDefault();await action(async()=>{
  if(mode==='signup'){const r=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirectTo}});if(!r.error&&alive.current)setMessage('Check your email to confirm your account, then come back here.');return r;}
  if(mode==='reset'){const r=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:redirectTo+'#/settings?reset=1'});if(!r.error&&alive.current)setMessage('If an account exists, a reset link is on its way.');return r;}
  const r=await supabase.auth.signInWithPassword({email:email.trim(),password});if(!r.error&&alive.current)onClose();return r;
 });}
 return <Modal title="Your Slop account" onClose={onClose} className="auth-modal player-auth">
  <div className="auth-layout"><aside className="auth-world" aria-label="Your place in Slop"><div className="auth-character-scene" aria-hidden="true"><span className="auth-orbit"/><RobotPortrait shell="core" face="slop" glow="lime" animated className="auth-main-character" alt=""/><RobotPortrait shell="neko" animated className="auth-friend-character" alt=""/><span className="auth-crown"><Icon name="crown" size={35}/></span></div><div className="auth-world-copy"><h3>Your next<br/>rival is waiting.</h3><p>One account. A whole world to play.</p><ul><li><Icon name="crown" size={17}/>Chase the crown</li><li><Icon name="heart" size={17}/>Keep your favorites</li><li><Icon name="code" size={17}/>Make your own games</li></ul></div></aside>
  <section className="auth-form-panel">
   {mode!=='reset'&&<div className="auth-mode-tabs" role="group" aria-label="Account access"><button type="button" aria-pressed={mode==='signin'} disabled={busy} onClick={()=>changeMode('signin')}>Sign in</button><button type="button" aria-pressed={mode==='signup'} disabled={busy} onClick={()=>changeMode('signup')}>Create account</button></div>}
   <h3>{mode==='reset'?'Let’s get you back in.':mode==='signup'?'Make it yours.':'Welcome back.'}</h3><p className="auth-intro">{sessionEnded?'Your session ended. Sign in again to continue.':mode==='reset'?'We’ll send a link to reset your password.':mode==='signup'?'Your games, your character, your next crown.': 'Use the same account as the Slop app.'}</p>
   {message?<div className="auth-confirmation" role="status"><span><Icon name="check" size={24}/></span><h4>Check your inbox.</h4><p>{message}</p><strong>{email.trim()}</strong><button className="text-button" type="button" onClick={()=>changeMode('signin')}>Back to sign in <Icon name="arrow" size={15}/></button></div>:<>
    {mode!=='reset'&&<><div className="oauth-actions"><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo}}))}><span className="auth-provider-mark" aria-hidden="true">G</span>Continue with Google</Button><Button variant="secondary" disabled={busy} onClick={()=>action(()=>supabase.auth.signInWithOAuth({provider:'apple',options:{redirectTo}}))}><svg className="auth-provider-mark" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.8 2.2c.1 1.4-.5 2.8-1.4 3.7-.8.9-2.1 1.6-3.4 1.5-.2-1.4.5-2.8 1.3-3.7.9-1 2.3-1.6 3.5-1.5ZM20.6 16.8c-.5 1.1-.8 1.6-1.4 2.5-.9 1.3-2.1 3-3.6 3-1.3.1-1.6-.8-3.4-.8-1.7.1-2 .9-3.4.9-1.5 0-2.6-1.5-3.5-2.8-2.5-3.6-2.8-8.6-1.3-10.9 1.1-1.6 2.8-2.5 4.4-2.5 1.6 0 2.6.9 3.9.9 1.2 0 2-.9 3.8-.9 1.4 0 2.9.8 4 2.1-3.5 1.9-3 6.8.5 8.5Z"/></svg>Continue with Apple</Button></div><div className="divider"><span>or use email</span></div></>}
    <form onSubmit={submit}><label>Email address<input type="email" name="email" autoComplete="email" required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>{mode!=='reset'&&<label>Password<span className="auth-password"><input type={showPassword?'text':'password'} name="password" aria-label="Password" minLength={8} autoComplete={mode==='signup'?'new-password':'current-password'} required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby={mode==='signup'?'auth-password-hint':undefined}/><button type="button" className="auth-reveal" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Hide':'Show'}</button></span>{mode==='signup'&&<small id="auth-password-hint">At least 8 characters.</small>}</label>}<Notice error={error}/><Button className="full" disabled={busy} type="submit">{busy?'One moment…':mode==='signin'?'Let’s play':mode==='signup'?'Create your account':'Send reset link'}<Icon name="arrow" size={17}/></Button></form>
    <div className="auth-options">{mode==='signin'?<button className="text-button" disabled={busy} type="button" onClick={()=>changeMode('reset')}>Forgot password?</button>:mode==='reset'?<button className="text-button" disabled={busy} type="button" onClick={()=>changeMode('signin')}><Icon name="back" size={15}/>Back to sign in</button>:<span>Already playing? <button className="text-button" disabled={busy} type="button" onClick={()=>changeMode('signin')}>Sign in</button></span>}<button className="text-button" type="button" onClick={onClose}>Keep exploring</button></div>
   </>}
   <p className="fine">By continuing, you agree to our <a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.</p>
  </section></div>
 </Modal>;
}
