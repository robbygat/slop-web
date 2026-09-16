import React, {useEffect, useRef, useState} from 'react';
import {Icon} from './Icon.jsx';
import './game-shelf.css';

export function GameShelf({children, label, resetKey}) {
  const rail = useRef(null);
  const [edges, setEdges] = useState({start:true,end:false});
  function measure() {
    const element = rail.current;
    if (!element) return;
    const start = element.scrollLeft <= 2;
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
    setEdges(previous => previous.start === start && previous.end === end ? previous : {start,end});
  }
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(rail.current);
    measure();
    return () => observer.disconnect();
  }, [children]);
  useEffect(() => {rail.current?.scrollTo({left:0,behavior:'instant'});measure();}, [resetKey]);
  function move(direction) {
    rail.current.scrollBy({left:direction * rail.current.clientWidth * .8,
      behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  return <div className="game-shelf">
    <div ref={rail} className="game-shelf-track" aria-label={label} onScroll={measure}>{children}</div>
    <div className="game-shelf-controls" aria-label={`${label} navigation`}>
      <button onClick={() => move(-1)} disabled={edges.start} aria-label={`Previous ${label.toLowerCase()}`}><Icon name="arrow" size={17}/></button>
      <button onClick={() => move(1)} disabled={edges.end} aria-label={`Next ${label.toLowerCase()}`}><Icon name="arrow" size={17}/></button>
    </div>
  </div>;
}
