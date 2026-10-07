import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {ownRpc} from '../lib/supabase.js';
import {inviteCodeFromParams,loadInvite,inviteReceiptMessages} from '../lib/invite-links.js';
import {Button,CopyButton,Empty,Notice} from '../components/ui.jsx';
import RobotPortrait from '../components/RobotPortrait.jsx';
import './invite.css';

export default function Invite({params}) {
  const {user,signIn}=useAuth();
  const code=inviteCodeFromParams(params);
  const [invite,setInvite]=useState(null),[loadError,setLoadError]=useState(null),[retry,setRetry]=useState(0);
  const [pending,setPending]=useState(null),[receipt,setReceipt]=useState(null);
  const active=useRef(null),lock=useRef(null);
  const scope=(user?.id||'guest')+':'+code;
  active.current=scope;
  useEffect(()=>{
    const controller=new AbortController();
    setInvite(null);setLoadError(null);
    if(code)loadInvite(code,{signal:controller.signal}).then(value=>setInvite(value)).catch(error=>{if(!controller.signal.aborted)setLoadError(error);});
    return()=>controller.abort();
  },[code,retry]);
  useEffect(()=>()=>{active.current=null;},[]);
  if(!code)return <Empty title="This invite needs a code." action={<a className="button" href="#/download">Get Slop</a>}>Ask your friend to share their invite again.</Empty>;
  const busy=pending===scope;
  const outcome=receipt?.scope===scope?receipt:null;
  async function accept() {
    if(!user){signIn();return;}
    if(!invite||lock.current===scope)return;
    const operation=scope;
    lock.current=operation;setPending(operation);setReceipt(null);
    try {
      const result=await ownRpc('apply_referral',{p_code:code});
      if(active.current!==operation)return;
      setReceipt({scope:operation,result,message:inviteReceiptMessages[result]||'Couldn’t accept this invite. Please try again.'});
    } catch(error) {
      if(active.current===operation)setReceipt({scope:operation,error});
    } finally {
      if(lock.current===operation)lock.current=null;
      if(active.current===operation)setPending(null);
    }
  }
  const complete=['ok','already','expired'].includes(outcome?.result);
  return <section className="invite-page" aria-labelledby="invite-title">
    <div className="invite-art"><RobotPortrait shell="core" alt="Your Slop is ready to play"/></div>
    <div className="invite-content"><p className="invite-eyebrow">A friend saved you a spot</p><h1 id="invite-title">Play together.<br/>Take the crown.</h1>
      <p className="invite-intro">Use your friend’s invite. You both get 50 Slop Coins when it’s accepted.</p>
      <div className="invite-code"><span>Invite code</span><strong>{code}</strong><CopyButton value={code} label="Copy code"/></div>
      <a className="button" href={`io.slop.game://invite?code=${code}`}>Open invite in Slop</a>
      <p className="invite-hint">Or enter this code in Profile → Settings → Invite friends.</p>
      <Notice error={loadError} onRetry={()=>setRetry(value=>value+1)}/>
      <div className="invite-account"><h2>Use it on the web</h2><p>{user?'Accept with your signed-in Slop account.':'Sign in to the same account you use in the app.'}</p>
        <Notice error={outcome?.error}/>{outcome?.message&&<p role="status" className={outcome.result==='ok'?'success':''}>{outcome.message}</p>}
        <Button variant="secondary" disabled={busy||complete||(!!user&&!invite)} onClick={accept}>{busy?'Accepting…':complete?'Invite recorded':user?'Accept invite':'Sign in to accept'}</Button>
      </div>
      <p className="fine">New here? <a href="#/download">Get the app.</a> Use one invite during your first seven days. Invite three new players who return after 24 hours and finish a public game by another creator to unlock SLOP Code.</p>
    </div>
  </section>;
}
