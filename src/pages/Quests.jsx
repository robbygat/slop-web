import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import RobotPortrait from '../components/RobotPortrait.jsx';
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
    <header className="quests-heading"><div><h1>Earn your crown.</h1><p>A little play. A little progress. A lot to make yours.</p></div><a className="button secondary" href="#/feed"><Icon name="play" size={18}/>Find a game</a></header>
    {!ready ? <Loading label="Opening your quests…"/> : user ? <AccountQuests key={user.id}/> : <GuestQuests onSignIn={signIn}/>}
  </div>;
}

function GuestQuests({onSignIn}) {
  return <>
    <section className="quest-welcome">
      <img className="quest-welcome-art" src="/assets/quests/weekly-crown.webp" alt=""/>
      <div><h2>Your next challenge is waiting.</h2><p>Sign in with your Slop account to see your quests, progress, and earned rewards.</p><div className="quest-actions"><Button onClick={onSignIn}>Sign in for quests</Button><a className="button secondary" href="#/feed">Keep playing</a></div></div>
    </section>
    <div className="quest-introductions">
      {[
        ['Daily', 'A new day. A new goal.', 'Fresh play goals each day.', 'daily-robots'],
        ['Weekly', 'Go a little further.', 'Bigger goals to work toward all week.', 'weekly-crown'],
        ['Starting', 'Start something good.', 'Your first milestones, at your own pace.', 'starter-crew'],
      ].map(([title, heading, copy, art]) => <section key={title} className="quest-journey"><img src={`/assets/quests/${art}.webp`} alt="" loading="lazy"/><div><h3>{title}</h3><p>{heading} {copy}</p></div></section>)}
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
    <section className="quest-player-progress quest-command" aria-label="Your verified player progress">
      <div className="quest-level-orbit" style={{'--level-progress':`${Math.min(100,progress.xp_into_level/progress.xp_for_level*100)}%`}}><div><RobotPortrait shell="core" face="slop" glow="lime" alt=""/><span>Level <strong>{number(progress.level)}</strong></span></div></div>
      <div className="quest-level-copy"><div><h2>Keep going.<br/>You’re getting somewhere.</h2></div><progress aria-label={`Level ${progress.level}: ${progress.xp_into_level} of ${progress.xp_for_level} XP`} value={progress.xp_into_level} max={progress.xp_for_level}/><p><strong>{number(progress.xp_into_level)} / {number(progress.xp_for_level)} XP</strong><span>{number(progress.xp_for_level-progress.xp_into_level)} to level {number(progress.level+1)}</span></p></div>
      <a href="#/shop" className="quest-balance"><Icon name="coins" size={29}/><strong>{number(snapshot.coin_balance)}</strong><span>Slop Coins <Icon name="arrow" size={15}/></span><small>Find your next look</small></a>
    </section>
    <AppProgressNote/>
    <div className="quest-toolbar"><div className="quest-categories" role="group" aria-label="Quest period">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{label}</button>)}</div><Button variant="small secondary" icon="refresh" disabled={loading || !!claiming} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</Button></div>
    <div className="quest-period-art"><img src={`/assets/quests/${category==='daily'?'daily-robots':category==='weekly'?'weekly-crown':'starter-crew'}.webp`} alt=""/><h2>{category==='daily'?'A new day. A new goal.':category==='weekly'?'Go a little further.':'Start something good.'}</h2></div><div className="quest-period-summary"><p>{completed} of {quests.length} complete</p><span>{resetLabel ? `Resets ${resetLabel}` : 'No time limit'}</span></div>
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
