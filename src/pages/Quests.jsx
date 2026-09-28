import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import {loadQuests, claimQuest} from '../lib/quests.js';
import {playerQuests, questAction, questExpired} from '../lib/quest-contracts.js';
import './quests.css';

const categories = [['daily', 'Daily'], ['weekly', 'Weekly'], ['starting', 'Starting']];
const number = value => value.toLocaleString();
function friendlyError(error) {
  if (['authentication_required', 'account_changed'].includes(error?.code)) return error;
  return new Error('Your quests could not be updated. Please try again.');
}

export default function Quests() {
  const {user, ready, signIn} = useAuth();
  return <div className="quests-page">
    <header className="quests-heading"><div><span className="eyebrow">A little challenge. A new favorite.</span><h1>Quests</h1><p>Play, make progress, and collect your rewards.</p></div><a className="button secondary" href="#/feed"><Icon name="play" size={18}/>Find a game</a></header>
    {!ready ? <Loading label="Opening your quests…"/> : user ? <AccountQuests key={user.id}/> : <GuestQuests onSignIn={signIn}/>}
  </div>;
}

function GuestQuests({onSignIn}) {
  return <>
    <section className="quest-welcome">
      <div className="quest-welcome-mark" aria-hidden="true"><Icon name="quest" size={58}/></div>
      <div><h2>Your next challenge is waiting.</h2><p>Sign in with your Slop account to see your quests, progress, and earned rewards.</p><div className="quest-actions"><Button onClick={onSignIn}>Sign in for quests</Button><a className="button secondary" href="#/feed">Keep playing</a></div></div>
    </section>
    <div className="quest-introductions">
      {[
        ['Daily', 'A fresh reason to come back.', 'New play goals each day.'],
        ['Weekly', 'Keep a good run going.', 'Work toward bigger goals throughout the week.'],
        ['Starting', 'Find your feet.', 'First milestones that stay until you finish them.'],
      ].map(([title, heading, copy]) => <section key={title}><span>{title}</span><h3>{heading}</h3><p>{copy}</p></section>)}
    </div>
    <AppProgressNote/>
  </>;
}

function AppProgressNote() {
  return <aside className="quest-app-note"><Icon name="download" size={22}/><div><strong>Play quests advance in the Slop app.</strong><p>Finish runs in the app with this same account. Your progress and rewards appear here.</p></div><a className="inline-link" href="#/download">Get the app<Icon name="arrow" size={16}/></a></aside>;
}

function AccountQuests() {
  const {refreshProfile} = useAuth();
  const [data, setData] = useState(null), [category, setCategory] = useState('daily');
  const [loading, setLoading] = useState(true), [claiming, setClaiming] = useState(null);
  const [error, setError] = useState(null), [message, setMessage] = useState('');
  const [clock, setClock] = useState(Date.now);
  const alive = useRef(false), pending = useRef(false), revision = useRef(0);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    const request = ++revision.current;
    setLoading(true); setError(null);
    try {
      const snapshot = await loadQuests();
      if (alive.current && request === revision.current) setData({snapshot, receivedAt: Date.now()});
    } catch (failure) {
      if (alive.current && request === revision.current) setError(friendlyError(failure));
    } finally {
      if (alive.current && request === revision.current) {pending.current = false; setLoading(false);}
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const resume = () => {if (document.visibilityState === 'visible') {setClock(Date.now()); void refresh();}};
    const timer = setInterval(resume, 30000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {alive.current = false; pending.current = false; revision.current++; clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume);};
  }, [refresh]);

  async function claim(quest) {
    if (pending.current || !data || !quest.completed || quest.claimed) return;
    const serverNow = Date.parse(data.snapshot.server_now) + Date.now() - data.receivedAt;
    if (questExpired(data.snapshot, quest, serverNow)) {void refresh(); return;}
    pending.current = true;
    const request = ++revision.current;
    setClaiming(quest.id); setError(null); setMessage('');
    try {
      const receipt = await claimQuest(quest.id);
      if (!alive.current || request !== revision.current) return;
      // Use absolute values from the receipt; a retried claim never adds twice.
      setData({snapshot: receipt.snapshot, receivedAt: Date.now()});
      setClock(Date.now());
      setMessage(receipt.code === 'claimed' ? 'Reward collected.' : receipt.code === 'already_claimed' ? 'This reward is already in your account.' : 'This quest is still in progress.');
      if (receipt.code !== 'not_complete') refreshProfile();
    } catch (failure) {
      if (alive.current && request === revision.current) setError(friendlyError(failure));
    } finally {
      if (alive.current && request === revision.current) {pending.current = false; setClaiming(null);}
    }
  }

  if (!data) return <><Notice error={error} onRetry={refresh}/>{loading ? <Loading label="Loading your quests…"/> : <div className="quest-empty"><h2>Your progress is still yours.</h2><p>Try loading again, or enjoy a game while we reconnect.</p><a className="button secondary" href="#/feed">Find a game</a></div>}</>;
  const snapshot = data.snapshot, progress = snapshot.trainer_progress;
  const quests = playerQuests(snapshot, category), completed = quests.filter(q => q.completed).length;
  const serverNow = Date.parse(snapshot.server_now) + Math.max(0, clock - data.receivedAt);
  const resetsAt = category === 'starting' ? null : new Date(snapshot[`${category}_resets_at`]);
  const resetLabel = resetsAt?.toLocaleString(undefined, {weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'});
  return <>
    <section className="quest-player-progress" aria-label="Your verified player progress">
      <div className="quest-level-mark"><span>Level</span><strong>{number(progress.level)}</strong></div>
      <div className="quest-level-copy"><div><h2>Your progress</h2><span>{number(progress.total_xp)} XP</span></div><progress aria-label={`Level ${progress.level}: ${progress.xp_into_level} of ${progress.xp_for_level} XP`} value={progress.xp_into_level} max={progress.xp_for_level}/><p>{number(progress.xp_for_level - progress.xp_into_level)} XP to the next level</p></div>
      <a href="#/shop" className="quest-balance"><strong>{number(snapshot.coin_balance)}</strong><span>Slop Coins<Icon name="arrow" size={15}/></span></a>
    </section>
    <AppProgressNote/>
    <div className="quest-toolbar"><div className="quest-categories" role="group" aria-label="Quest period">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{label}</button>)}</div><Button variant="small secondary" icon="refresh" disabled={loading || !!claiming} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</Button></div>
    <div className="quest-period-summary"><p>{completed} of {quests.length} complete</p><span>{resetLabel ? `Resets ${resetLabel}` : 'No time limit'}</span></div>
    <Notice error={error} onRetry={refresh}/>{error && <p className="fine">Showing your last verified progress.</p>}
    {message && <p className="success" role="status">{message}</p>}
    <div className="quest-cards">{quests.map(quest => <QuestCard key={quest.id} quest={quest} expired={questExpired(snapshot, quest, serverNow)} disabled={loading || !!claiming} claiming={claiming === quest.id} onClaim={() => claim(quest)}/>)}</div>
    {!quests.length && <div className="quest-empty"><Icon name="check" size={32}/><h2>No {category} play quests right now.</h2><p>Check another period, or find your next favorite game.</p><a className="button secondary" href="#/feed">Find a game</a></div>}
  </>;
}

function QuestCard({quest, expired, disabled, claiming, onClaim}) {
  const action = questAction(quest), status = quest.claimed ? 'Collected' : quest.completed ? 'Ready to collect' : 'In progress';
  return <article className={`quest-card ${quest.claimed ? 'is-claimed' : quest.completed ? 'is-complete' : ''}`}>
    <div className="quest-card-top"><span className="quest-card-icon"><Icon name={quest.completed ? 'check' : 'quest'} size={22}/></span><span className="quest-status">{expired ? 'Refreshing period' : status}</span></div>
    <h3>{quest.title}</h3><p>{quest.description}</p>
    <div className="quest-rewards" aria-label="Quest rewards">{quest.reward.xp > 0 && <span>{number(quest.reward.xp)} XP</span>}{quest.reward.coins > 0 && <span>{number(quest.reward.coins)} Slop Coins</span>}{quest.reward.cosmetic_name && <span>{quest.reward.cosmetic_name}</span>}</div>
    <div className="quest-card-progress"><progress aria-label={`${quest.title}: ${quest.progress} of ${quest.target}`} value={quest.progress} max={quest.target}/><span>{number(quest.progress)} / {number(quest.target)}</span></div>
    {quest.claimed ? <span className="quest-collected"><Icon name="check" size={17}/>Reward collected</span> : quest.completed ? <Button disabled={disabled || expired} onClick={onClaim}>{claiming ? 'Collecting…' : expired ? 'Refresh quests' : 'Collect reward'}</Button> : <a className="button secondary" href={action.href}>{action.label}<Icon name="arrow" size={17}/></a>}
  </article>;
}
