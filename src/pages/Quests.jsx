import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import RobotPortrait from '../components/RobotPortrait.jsx';
import RobotStage from '../components/RobotStage.jsx';
import SlopMark from '../components/SlopMark.jsx';
import {loadQuests, claimQuest} from '../lib/quests.js';
import {questAction, questExpired} from '../lib/quest-contracts.js';
import {questJourney, questTimeLeft} from '../lib/quest-journey.js';
import './quests.css';
import './quest-world.css';

const categories = [['daily', 'Daily'], ['weekly', 'Weekly'], ['starting', 'Starting']];
const number = value => value.toLocaleString();
const worlds = {
  daily: {title: 'Make today count.', copy: 'Fresh goals for your next few games. Come back tomorrow for a new challenge.', art: 'daily-robots', icon: 'daily-energy'},
  weekly: {title: 'Go after something bigger.', copy: 'A whole week to play, climb, and bring home something good.', art: 'weekly-crown', icon: 'weekly-vault'},
  starting: {title: 'Your first of many.', copy: 'Make yourself at home. Your first milestones are waiting, with no time limit.', art: 'starter-crew', icon: 'starter-steps'},
};
function friendlyError(error) {
  if (['authentication_required', 'account_changed'].includes(error?.code)) return error;
  return new Error('Your quests could not be updated. Please try again.');
}

export default function Quests() {
  const {user, ready, signIn} = useAuth();
  return <div className="quests-page">
    {user && <header className="quests-heading"><div><span className="quest-eyebrow">Your next adventure</span><h1>Make every play count.</h1><p>Find your next mission. Collect your rewards. Make your Slop yours.</p></div><a className="button secondary" href="#/feed"><Icon name="play" size={18}/>Find a game</a></header>}
    {!ready ? <Loading label="Opening your quests…"/> : user ? <AccountQuests key={user.id}/> : <GuestQuests onSignIn={signIn}/>}
  </div>;
}

function GuestQuests({onSignIn}) {
  const [period, setPeriod] = useState('daily');
  const current = worlds[period];
  return <>
    <section className="quest-launch"><div><span className="quest-eyebrow">Little missions. Big personality.</span><h1>Make every<br/>play count.</h1><p>Your next game can be your next little win.<br/>Find a mission, collect rewards, and make your Slop yours.</p><Button onClick={onSignIn}>Find my quests <Icon name="arrow" size={18}/></Button></div><div className="quest-crown-stage"><SlopMark/><RobotStage shell="core" face="slop" glow="lime" crown="diamond"/><span className="quest-orbit orbit-one"/><span className="quest-orbit orbit-two"/></div></section>
    <div className="quest-how"><div><span>01</span><Icon name="play" size={22}/><strong>Pick a mission</strong><p>A quick daily goal or a bigger weekly adventure.</p></div><div><span>02</span><Icon name="quest" size={22}/><strong>Play in the app</strong><p>Your runs and progress stay with your account.</p></div><div><span>03</span><Icon name="spark" size={22}/><strong>Make it yours</strong><p>Collect XP, Slop Coins, and quest looks as you earn them.</p></div></div>
    <section className="quest-trail-picker" aria-label="Explore quests"><div className="quest-trail-tabs" role="group" aria-label="Quest period">{categories.map(([id, label]) => <button key={id} aria-pressed={period === id} onClick={() => setPeriod(id)}>{label}<Icon name="arrow" size={17}/></button>)}</div><div className="quest-trail-feature" key={period}><img src={`/assets/quests/${current.art}.webp`} alt=""/><div><h2>{current.title}</h2><p>{current.copy}</p><Button variant="secondary" onClick={onSignIn}>See my {period === 'starting' ? 'first' : period} missions <Icon name="arrow" size={16}/></Button><span className="quest-guest-note">Your real missions and rewards appear after sign in.</span></div></div></section>
    <AppProgressNote/>
  </>;
}

function AppProgressNote() {
  return <aside className="quest-app-note"><Icon name="download" size={22}/><div><strong>Play in the app. Bring your rewards here.</strong><p>Play quests advance through runs in the Slop app. Use the same account to see progress and collect rewards on the web.</p></div><a className="inline-link" href="#/download">Get the app<Icon name="arrow" size={16}/></a></aside>;
}

function AccountQuests() {
  const {refreshProfile, profile} = useAuth();
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
      setMessage(receipt.code === 'claimed' ? `Collected: ${rewardLabel(receipt.awarded)}.` : receipt.code === 'already_claimed' ? 'This reward is already in your account.' : 'This quest is still in progress.');
      if (receipt.code !== 'not_complete') refreshProfile();
    } catch (failure) {
      if (alive.current && request === revision.current) setError(friendlyError(failure));
    } finally {
      if (alive.current && request === revision.current) {pending.current = false; setClaiming(null);}
    }
  }

  if (!data) return <><Notice error={error} onRetry={refresh}/>{loading ? <Loading label="Loading your quests…"/> : <div className="quest-empty"><h2>Your progress is still yours.</h2><p>Try loading again, or enjoy a game while we reconnect.</p><Button variant="secondary" onClick={refresh}>Load my quests <Icon name="refresh" size={17}/></Button><a className="inline-link" href="#/feed">Find a game<Icon name="arrow" size={16}/></a></div>}</>;
  const snapshot = data.snapshot, progress = snapshot.trainer_progress;
  const serverNow = Date.parse(snapshot.server_now) + Math.max(0, clock - data.receivedAt);
  const journey = questJourney(snapshot, category, serverNow);
  const resetAt = category === 'starting' ? null : snapshot[`${category}_resets_at`];
  const resetLabel = resetAt ? new Date(resetAt).toLocaleString(undefined, {weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}) : null;
  const timeLabel = questTimeLeft(resetAt, serverNow);
  const busy = loading || !!claiming;
  return <>
    <section className="quest-profile-strip" aria-label="Your verified player progress">
      <RobotPortrait className="quest-player-look" look={profile?.slop_look} alt=""/>
      <div className="quest-strip-level"><h2>Level {number(progress.level)} <span>{progress.rank}</span></h2><progress aria-label={`Level ${progress.level}: ${progress.xp_into_level} of ${progress.xp_for_level} XP`} value={progress.xp_into_level} max={progress.xp_for_level}/><p><strong>{number(progress.xp_for_level - progress.xp_into_level)} XP</strong> to level {number(progress.level + 1)}</p></div>
      <a href="#/shop" className="quest-wallet"><Icon name="coins" size={25}/><div><strong>{number(snapshot.coin_balance)}</strong><span>Slop Coins</span></div><Icon name="arrow" size={17}/></a>
    </section>
    <div className="quest-toolbar"><div className="quest-categories" role="group" aria-label="Quest period">{categories.map(([id, label]) => {
      const count = questJourney(snapshot, id, serverNow).ready.length;
      return <button key={id} aria-pressed={category === id} className={category === id ? 'selected' : ''} onClick={() => setCategory(id)}>{label}{count > 0 && <span className="quest-tab-ready" aria-label={`${count} ${count === 1 ? 'reward' : 'rewards'} ready to collect`}>{count}</span>}</button>;
    })}</div><Button variant="small secondary" icon="refresh" disabled={busy} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</Button></div>
    <Notice error={error} onRetry={refresh}/>{error && <p className="fine">Showing your last verified progress.</p>}
    {message && <p className="success" role="status">{message}</p>}
    <QuestFocus journey={journey} category={category} timeLabel={timeLabel} resetLabel={resetLabel} disabled={busy} claiming={claiming} onClaim={claim} onRefresh={refresh}/>
    <AppProgressNote/>
    {journey.ready.length > 1 && <QuestGroup title="More rewards waiting" description="You've done the playing. Bring these rewards home." quests={journey.ready.filter(quest => quest.id !== journey.next?.id)} disabled={busy} claiming={claiming} onClaim={claim} ready/>}
    {journey.unfinished.some(quest => quest.id !== journey.next?.id) && <QuestGroup title="Your path continues" description="Follow your curiosity. These missions can be played in any order." quests={journey.unfinished.filter(quest => quest.id !== journey.next?.id)} disabled={busy} claiming={claiming} onClaim={claim}/>}
    {journey.refreshing.length > 0 && <div className="quest-period-refresh" role="status"><Icon name="refresh" size={21}/><div><strong>This period has ended.</strong><p>Refresh to discover your new missions. Your collected rewards stay yours.</p></div><Button variant="small secondary" disabled={busy} onClick={refresh}>Refresh quests</Button></div>}
    {journey.collected.length > 0 && <details className="quest-collection"><summary><span><Icon name="check" size={19}/>Your collected wins</span><span>{journey.collected.length}<Icon name="chevron" size={17}/></span></summary><div>{journey.collected.map(quest => <div className="quest-collected-row" key={quest.id}><Icon name="check" size={19}/><div><h3>{quest.title}</h3><p>{rewardLabel(quest.reward)}</p></div>{quest.reward.cosmetic_id && <a href="#/shop" className="inline-link">Find your look<Icon name="arrow" size={15}/></a>}</div>)}</div></details>}
  </>;
}

function rewardLabel(reward) {
  return [reward.xp > 0 && `${number(reward.xp)} XP`, reward.coins > 0 && `${number(reward.coins)} Slop Coins`, reward.cosmetic_name].filter(Boolean).join(' · ');
}

function QuestRewards({reward}) {
  return <div className="quest-rewards" aria-label="Quest rewards">{reward.xp > 0 && <span><Icon name="spark" size={14}/>{number(reward.xp)} XP</span>}{reward.coins > 0 && <span><Icon name="coins" size={14}/>{number(reward.coins)} Slop Coins</span>}{reward.cosmetic_name && <span><Icon name="shop" size={14}/>{reward.cosmetic_name}</span>}</div>;
}

function QuestFocus({journey, category, timeLabel, resetLabel, disabled, claiming, onClaim, onRefresh}) {
  const quest = journey.next, world = worlds[category];
  const allCollected = journey.quests.length > 0 && journey.collected.length === journey.quests.length;
  const action = quest && questAction(quest);
  return <section className={`quest-focus quest-focus-${category} ${quest?.completed ? 'is-ready' : ''}`} aria-label={quest ? `Recommended quest: ${quest.title}` : `${category} quests`}>
    <div className="quest-focus-scene"><img src={`/assets/quests/${world.art}.webp`} alt=""/><div className="quest-scene-label"><Icon name="quest" size={16}/>{world.title}</div><div className="quest-path-status"><strong>{journey.collected.length}<span> / {journey.quests.length}</span></strong><span>rewards collected</span><div className="quest-path-dots" aria-hidden="true">{journey.quests.map(q => <i key={q.id} className={q.claimed ? 'collected' : q.completed ? 'ready' : ''}/>)}</div></div></div>
    <div className="quest-focus-content"><div className="quest-focus-meta"><span className="quest-eyebrow">{quest?.completed ? 'Your reward is ready' : quest ? 'Your next move' : allCollected ? 'Look at you go' : 'Your next adventure'}</span><span title={resetLabel || undefined}>{timeLabel}</span></div>
      {quest ? <><h2>{quest.title}</h2><p>{quest.description}</p><QuestRewards reward={quest.reward}/><div className="quest-focus-progress"><progress aria-label={`${quest.title}: ${quest.progress} of ${quest.target}`} value={quest.progress} max={quest.target}/><span>{number(quest.progress)} / {number(quest.target)}<small>{quest.completed ? 'Complete' : quest.progress > 0 ? 'Already on your way' : 'Ready when you are'}</small></span></div>{quest.completed ? <Button disabled={disabled} onClick={() => onClaim(quest)}>{claiming === quest.id ? 'Collecting…' : 'Collect my reward'}<Icon name="arrow" size={18}/></Button> : <a className="button" href={action.href}>{action.label}<Icon name="arrow" size={18}/></a>}<span className="quest-focus-footnote">{quest.completed ? 'Collected rewards go straight to your account.' : quest.progress > 0 ? 'Your closest unfinished mission, based on your progress.' : 'A little adventure to get you started.'}</span></> : <><h2>{allCollected ? 'All yours. Nicely played.' : journey.refreshing.length ? 'A fresh adventure awaits.' : 'A little breathing room.'}</h2><p>{allCollected ? 'Every reward on this path is in your account. Try a new look, or choose another quest period for your next goal.' : journey.refreshing.length ? 'This period has ended. Refresh to see your new missions.' : `No ${category} play missions right now. Try another period or discover a new favorite game.`}</p>{journey.refreshing.length ? <Button variant="secondary" disabled={disabled} onClick={onRefresh}>Find my new missions<Icon name="refresh" size={17}/></Button> : <a href={allCollected ? '#/shop' : '#/feed'} className="button">{allCollected ? 'Make your Slop yours' : 'Find a game'}<Icon name="arrow" size={18}/></a>}</>}
      {(journey.rewards.xp > 0 || journey.rewards.coins > 0 || journey.rewards.looks > 0) && <div className="quest-path-rewards"><span>Rewards on this path</span><p>{journey.rewards.xp > 0 && <strong>{number(journey.rewards.xp)} XP</strong>}{journey.rewards.coins > 0 && <strong>{number(journey.rewards.coins)} Coins</strong>}{journey.rewards.looks > 0 && <strong>{number(journey.rewards.looks)} {journey.rewards.looks === 1 ? 'look' : 'looks'}</strong>}</p><small>Finish missions and collect each reward to make it yours.</small></div>}
    </div>
  </section>;
}

function QuestGroup({title, description, quests, disabled, claiming, onClaim, ready = false}) {
  return <section className={`quest-route ${ready ? 'quest-route-ready' : ''}`}><header><h2>{title}</h2><p>{description}</p></header><div className="quest-ticket-grid">{quests.map((quest, index) => <QuestCard key={quest.id} index={index} quest={quest} disabled={disabled} claiming={claiming === quest.id} onClaim={() => onClaim(quest)}/>)}</div></section>;
}

function QuestCard({quest, index, disabled, claiming, onClaim}) {
  const action = questAction(quest);
  return <article className={`quest-ticket ${quest.completed ? 'is-complete' : ''}`}>
    <div className="quest-ticket-top"><img className="quest-mission-art" src={`/assets/quests/${worlds[quest.category].icon}.webp`} alt=""/><span className="quest-ticket-step">{String(index + 1).padStart(2, '0')}</span><span className="quest-status">{quest.completed ? 'Ready to collect' : quest.progress > 0 ? 'In progress' : 'Not started'}</span></div>
    <h3>{quest.title}</h3><p>{quest.description}</p><QuestRewards reward={quest.reward}/>
    <div className="quest-card-progress"><progress aria-label={`${quest.title}: ${quest.progress} of ${quest.target}`} value={quest.progress} max={quest.target}/><span>{number(quest.progress)} / {number(quest.target)}</span></div>
    {quest.completed ? <Button disabled={disabled} onClick={onClaim}>{claiming ? 'Collecting…' : 'Collect reward'}<Icon name="arrow" size={17}/></Button> : <a className="button secondary" href={action.href}>{action.label}<Icon name="arrow" size={17}/></a>}
  </article>;
}
