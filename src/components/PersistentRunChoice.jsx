import React from 'react';
import {Button,Notice} from './ui.jsx';

export default function PersistentRunChoice({journey}){
 const {view,choice,busy,choose,resolveConflict}=journey;
 if(!journey.enabled)return null;
 if(view.loading)return <div className="persistent-run-choice" role="status"><p className="eyebrow">Slop World</p><h2>Finding your place…</h2><p>Checking your saved progress.</p></div>;
 if(view.fatal||view.retired)return <div className="persistent-run-choice"><h2>Your progress stays yours.</h2><Notice error={view.error}/><p>Reopen this game to try again. No save was replaced.</p></div>;
 if(view.conflict)return <div className="persistent-run-choice" role="dialog" aria-modal="true" aria-label="Choose your Slop World save"><p className="eyebrow">Two copies. Your choice.</p><h2>Where should we continue?</h2><p>Progress changed on another device. Both copies are kept in recovery history.</p><Notice error={view.error}/><Button disabled={busy} onClick={()=>resolveConflict('device')}>Use this device</Button><Button variant="secondary" disabled={busy} onClick={()=>resolveConflict('cloud')}>Use cloud save</Button><p className="fine">The game will reopen with the copy you choose.</p></div>;
 if(!choice)return null;
 return <div className="persistent-run-choice" role="dialog" aria-modal="true" aria-label="Continue Slop World"><p className="eyebrow">Slop World</p><h2>Pick up where you left off.</h2><p>{view.run?.run_label||'Your saved adventure is ready.'}</p><Notice error={view.error}/><Button disabled={busy} onClick={()=>choose(false)}>{busy?'Saving…':'Continue'}</Button><Button variant="secondary" disabled={busy} onClick={()=>choose(true)}>New run</Button><p className="fine">New run resets this adventure. Your unlocks and lasting progress stay.</p></div>;
}
