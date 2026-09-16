import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth.jsx';
import {ownRpc} from '../lib/supabase.js';
import {coinSnapshot,dailyCoinReceipt} from '../lib/coin-contracts.js';
import {Button,Modal,Notice} from './ui.jsx';

export function CoinMark({className=''}){return <img className={`coin-mark ${className}`} src="/assets/mobile/slop-coin-current.webp" width="48" height="48" alt=""/>;}

export function CoinPanel({onClose,onBalance}){
 const{user,requireAuth}=useAuth();
 const[snapshot,setSnapshot]=useState(null),[error,setError]=useState(null),[loading,setLoading]=useState(!!user),[claiming,setClaiming]=useState(false),[claimed,setClaimed]=useState(false);
 const revision=useRef(0),alive=useRef(true),claimLock=useRef(false);
 async function load(){
  const request=++revision.current;setLoading(true);setError(null);
  try{const data=coinSnapshot(await ownRpc('my_coins'));if(alive.current&&request===revision.current)setSnapshot(data);}
  catch(e){if(alive.current&&request===revision.current)setError(e);}
  finally{if(alive.current&&request===revision.current)setLoading(false);}
 }
 useEffect(()=>{alive.current=true;if(user)load();return()=>{alive.current=false;revision.current++;};},[user?.id]);
 async function claim(){
  if(claimLock.current||!requireAuth())return;
  claimLock.current=true;++revision.current;setClaiming(true);setError(null);
  try{const data=await ownRpc('claim_daily_coins');const next=dailyCoinReceipt(data);if(!alive.current)return;setSnapshot(next);setClaimed(data.claimed);onBalance(next);}
  catch(e){if(alive.current)setError(e);}
  finally{claimLock.current=false;if(alive.current){setClaiming(false);setLoading(false);}}
 }
 const ready=snapshot?.daily_claim_available===true;
 const next=snapshot?.next_claim_at&&Number.isFinite(Date.parse(snapshot.next_claim_at))?new Date(snapshot.next_claim_at):null;
 return <Modal title="Slop Coins" onClose={onClose} className="coin-panel">
  <div className="coin-panel-balance"><CoinMark/><div><span>Your balance</span><strong>{user?(snapshot?.balance?.toLocaleString()??'…'):'Your next look awaits'}</strong></div></div>
  <p className="coin-panel-intro">The same coins and wardrobe, on your phone and here.</p>
  {!user?<Button className="full" onClick={()=>{onClose();requireAuth();}}>Sign in to see your coins</Button>:<>
   <section className={`daily-coins ${ready?'ready':''}`}>
    <div><h3>Your daily treat</h3><p>{loading?'Checking today’s coins…':claiming?'Claiming…':!snapshot?'Couldn’t load coins':ready?'Today’s coins are ready':snapshot.daily_reward?`+${snapshot.daily_reward.toLocaleString()} coins`:'Claimed today'}</p><small>{claimed?'Added to your balance':ready?'A little something for your next look.':next?`Next drop ${next.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:snapshot?'Come back tomorrow':'Try again in a moment'}</small></div>
    <button className="daily-coin-button" disabled={loading||claiming||(!ready&&!error)} aria-label={error?'Retry daily coins':ready?'Claim daily coins':'Daily coins claimed'} onClick={snapshot?claim:load}><CoinMark/></button>
    <Button className="full" disabled={loading||claiming||(!ready&&!error)} onClick={snapshot?claim:load}>{claiming?'Claiming…':loading?'Loading…':ready?'Claim daily coins':error?'Try again':'Claimed today'}</Button>
   </section>
   <Notice error={error} onRetry={snapshot?undefined:load}/>
  </>}
  <div className="coin-panel-notes"><p>Spend coins on new looks in the Shop.</p><p>Stripe payments are coming soon.</p></div>
 </Modal>;
}
