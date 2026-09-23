import React, {useEffect, useRef, useState} from 'react';
import {Slop} from './ui.jsx';
import {lookSignature} from '../lib/slop-native-atlas.js';
import catalog from '../data/mobile/eye-motion-catalog.json';

const portraits = new Map(catalog.map(entry => [entry.signature, entry]));

// These are direct native Flutter eye frames, with a fixed body. Social cards
// share decoded images rather than each starting a Flutter engine.
export default function NativeEyePortrait({look,body='ghost',color='tangerine',className='',alt='',...props}) {
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [failed, setFailed] = useState(null);
  const entry = portraits.get(lookSignature({body,palette:color,...look}));
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(media.matches);
    const onVisibility = () => setHidden(document.hidden);
    const observer = new IntersectionObserver(([item]) => setVisible(item.isIntersecting));
    if (host.current) observer.observe(host.current);
    media.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {observer.disconnect();media.removeEventListener('change',onMotion);document.removeEventListener('visibilitychange',onVisibility);};
  }, [!!entry]);
  if (!entry) return <Slop look={look} body={body} color={color} className={className} alt={alt} {...props}/>;
  const animated = visible && !hidden && !reduced && failed !== entry.url;
  return <img ref={host} className={`slop ${className}`} src={animated ? entry.url : entry.poster} alt={alt}
    width={entry.size} height={entry.size} loading="lazy" decoding="async" data-native-eyes={animated?'animated':'still'}
    onError={() => setFailed(entry.url)}/>;
}
