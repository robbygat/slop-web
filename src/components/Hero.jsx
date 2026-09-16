import React, {lazy, Suspense, useEffect, useRef, useState} from 'react';
import {loadGame} from '../lib/catalog.js';
import {gameEntry} from '../lib/contracts.js';
import {Icon} from './Icon.jsx';
import {Loading} from './ui.jsx';
import {GameplayReel} from './GameplayReel.jsx';
import HeroComposer from './HeroComposer.jsx';
import './hero.css';

const LiveGame = lazy(() => import('./GamePlayer.jsx').then(module => ({default: module.GamePlayer})));
const desktop = [
  {file: 'run-infinite-desktop', folder: 'games', name: 'Run Infinite', creator: 'slop.game', slug: 'run-infinite-desktop'},
  {file: 'slopkart-desktop', folder: 'games', name: 'SlopKart', creator: 'slop.game', slug: 'slopkart-desktop'},
  {file: 'sloppy-zombies-desktop', folder: 'games', name: 'Sloppy Zombies', creator: 'slop.game', slug: 'sloppy-zombies-desktop'},
  {file: 'dungeon-panic-desktop', folder: 'games', name: 'Dungeon Panic', creator: 'slop.game', slug: 'dungeon-panic-desktop'},
  {file: 'slopcraft-desktop', poster: '/assets/games/slopcraft-desktop-poster.webp', folder: 'games', name: 'Slopcraft', creator: 'slop.game', slug: 'slopcraft-desktop'},
  {file: 'umbral-red-desktop', folder: 'games', name: 'Umbral Red', creator: 'slop.game', slug: 'umbral-red-desktop'},
];
const mobile = [
  {file: 'night-drift', folder: 'gameplay', name: 'Night Drift', creator: 'rob', slug: 'voxel-drift-ace-9s5l'},
  {file: 'surfy-sub', folder: 'gameplay', name: 'Surfy Sub', creator: 'rob', slug: 'surfy-sub-d6zs'},
  {file: 'flappy-duck', folder: 'gameplay', name: 'Flappy Duck', creator: 'rob', slug: 'flappy-duck-7prm'},
  {file: 'stax', folder: 'gameplay', name: 'Stax', creator: 'rob', slug: 'shear-stack-85048e702bb293254ebb9bd0f4926638'},
];

export default function Hero() {
  const root = useRef(null), pending = useRef(false);
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 700px)').matches);
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(true);
  const [game, setGame] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [clip, setClip] = useState(0), [requestedClip, setRequestedClip] = useState(0);
  const featured = (compact ? mobile : desktop)[clip];
  useEffect(() => {
    const size = matchMedia('(max-width: 700px)'), motion = matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => {if (!game && !pending.current) {setCompact(size.matches); setClip(0); setRequestedClip(0);}};
    const preference = () => setPaused(motion.matches);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden));
    observer.observe(root.current);
    const visibility = () => setVisible(!document.hidden && (root.current?.getBoundingClientRect().bottom ?? 0) > 0);
    size.addEventListener('change', resize); motion.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    resize();
    return () => {observer.disconnect(); size.removeEventListener('change', resize); motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility);};
  }, [game]);
  async function play() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {setGame(await loadGame(featured.slug));}
    catch {setError('This game is temporarily unavailable. Try again or browse the other games below.');}
    finally {pending.current = false; setBusy(false);}
  }
  function closeGame() {
    setGame(null);setClip(0);setRequestedClip(0);setError('');
    requestAnimationFrame(() => root.current?.scrollIntoView({block:'start',behavior:'instant'}));
  }
  return <section ref={root} className={`arcade-hero ${compact ? 'is-portrait' : ''} ${game ? 'is-live' : ''}`} aria-label="Play on Slop">
    <div className="arcade-stage">
      <h1 className={game ? 'sr-only' : 'arcade-title'}>Just<br/> play.</h1>
      {game ? <Suspense fallback={<div className="arcade-loading"><Loading label={`Opening ${game.name}…`}/></div>}>
        <LiveGame game={game} url={gameEntry(game)} title={game.name} paused={!visible} initialMuted requireInteraction/>
      </Suspense> : <>
        <GameplayReel key={compact ? 'mobile' : 'desktop'} items={compact ? mobile : desktop}
          running={!paused && visible && !busy} selected={requestedClip}
          onSelect={index => {setClip(index); setRequestedClip(index);}}
          onChoose={index => {setRequestedClip(index); setError('');}}/>
        <div className="arcade-shade" aria-hidden="true"/>
        <div className="arcade-feature">
          <div className="arcade-game-name"><h2>{featured.name}</h2><span>@{featured.creator}</span></div>
          <button className="arcade-play" onClick={play} disabled={busy} aria-label={`Play ${featured.name}`}>{busy ? 'Opening…' : 'Play now'}<Icon name="arrow" size={21}/></button>
        </div>
        <div className="arcade-create"><HeroComposer/></div>
        {error && <p className="arcade-error" role="alert">{error}</p>}
        <button className="arcade-motion" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play gameplay preview' : 'Pause gameplay preview'}>{paused ? '▷' : 'Ⅱ'}</button>
      </>}
    </div>
    <div className="arcade-footer">
      {game ? <button onClick={closeGame} className="arcade-link"><Icon name="close" size={17}/>Close game</button> : <a className="arcade-link" href="#/feed">Browse games<Icon name="arrow" size={18}/></a>}
      {game && <a className="arcade-make" href="#/build">Make a game<Icon name="plus" size={19}/></a>}
    </div>
  </section>;
}
