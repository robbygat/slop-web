import React, {useEffect, useRef, useState} from 'react';
import './slop-motion.css';

// Native Flutter frames, decoded by the browser's video pipeline. Marketing
// scenes do not need an interactive Flutter engine or a JavaScript frame loop.
export default function SlopMotion({className = '', variant = 'ghost-tangerine-idle', poster = 'ghost-tangerine-poster', paused = false, alt = 'Slop'}) {
  const host = useRef(null), video = useRef(null);
  const [visible, setVisible] = useState(false), [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(host.current);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches), visibility = () => setHidden(document.hidden);
    media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
    return () => {observer.disconnect(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility);};
  }, []);
  useEffect(() => {
    if (!video.current) return;
    if (visible && !hidden && !paused && !reduced && !failed) video.current.play().catch(() => {});
    else video.current.pause();
  }, [visible, hidden, paused, reduced, failed]);
  function ready() {
    if(loaded||failed||!video.current||video.current.readyState<2)return;
    // Some browsers decode VP9 but discard alpha. Keep the exact native poster
    // in those browsers instead of showing a black rectangle behind the Slop.
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(video.current, 0, 0, 1, 1, 0, 0, 1, 1);
      if (context.getImageData(0, 0, 1, 1).data[3] > 16) {setFailed(true); return;}
      setLoaded(true);
    } catch {setFailed(true);}
  }
  return <span ref={host} className={`slop-motion ${className}`} data-native-motion={loaded && !failed ? 'video' : 'poster'}>
    <img src={`/assets/mobile/motion/${poster}.webp`} alt={alt} width="512" height="512"/>
    {!reduced && !failed && <video ref={video} className={loaded ? 'is-ready' : ''} src={`/assets/mobile/motion/${variant}.webm`} muted loop playsInline preload="metadata" aria-hidden="true" onLoadedData={ready} onCanPlay={ready} onPlaying={ready} onError={() => setFailed(true)}/>}
  </span>;
}
