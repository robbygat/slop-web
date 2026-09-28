import React, {useEffect, useRef, useState} from 'react';
import {gameEntry, previewVideo, trustedMedia} from '../lib/contracts.js';
import {GamePlayer} from './GamePlayer.jsx';

// Scrolling plays one recorded loop. Game code starts only after a play tap.
export function FeedVideoPreview({game, paused, onEvent}) {
  const [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false);
  const el = useRef(null), video = previewVideo(game);
  const poster = video?.poster || trustedMedia(game.thumb);
  useEffect(() => {
    const sync = () => {
      const v = el.current;
      if (!v) return;
      if (paused || document.hidden || playing) v.pause();
      else {v.muted = true; v.play().catch(() => {});}
    };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => {document.removeEventListener('visibilitychange', sync); el.current?.pause();};
  }, [paused, playing, video?.src]);
  if (playing) return <div className="feed-live-game">{poster&&<img className="feed-game-backdrop" src={poster} alt=""/>}<GamePlayer url={gameEntry(game)} game={game} title={game.name} initialMuted requireInteraction paused={paused} onEvent={onEvent}/></div>;
  return <button type="button" className="feed-video-preview" aria-label={`Play ${game.name}`} onClick={() => setPlaying(true)}>
    {poster && <><img className="feed-video-backdrop" src={poster} alt=""/><img className="feed-video-poster" src={poster} alt=""/></>}
    {video && !failed && <video ref={el} src={video.src} poster={video.poster} autoPlay muted loop playsInline preload="auto" disablePictureInPicture onError={() => setFailed(true)}/>}
    <span className="feed-video-play">Play<span aria-hidden="true"> ▶</span></span>
  </button>;
}
