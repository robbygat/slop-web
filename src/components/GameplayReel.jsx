import React, {useEffect, useRef, useState} from 'react';
import mediaVersions from '../lib/hero-media-versions.json';
import {mobileReelIndex, mobileReelStart} from '../lib/mobile-reel.js';

const version = (item, kind) => mediaVersions[`${item.folder}/${item.file}`]?.[kind] || 'short';
const film = item => `/assets/${item.folder}/${item.file}.mp4?v=${version(item,'video')}`;
const poster = item => `${item.poster || `/assets/${item.folder}/${item.file}.jpg`}?v=${version(item,'poster')}`;

// Only the current clip plays. Prepare one successor shortly before the cut,
// keeping the current frame visible until its replacement can actually render.
export function GameplayReel({items, running, onSelect, selected, onChoose}) {
  const players = useRef([]), queued = useRef(null), switching = useRef(false);
  const [slots, setSlots] = useState([0, null]), [active, setActive] = useState(0);
  const activate = () => {
    const next = queued.current;
    if (!next?.requested) return;
    const player = players.current[next.slot];
    if (!player || player.readyState < 2 || player.getAttribute('src') !== film(items[next.index])) return;
    players.current[active]?.pause();
    player.currentTime = 0;
    queued.current = null;
    switching.current = false;
    setActive(next.slot);
    onSelect(next.index);
  };
  function queue(index, requested = false) {
    if (queued.current?.index === index) {
      queued.current.requested ||= requested;
      activate();
      return;
    }
    const slot = 1 - active;
    queued.current = {slot, index, requested};
    setSlots(previous => previous.map((value, i) => i === slot ? index : value));
  }
  useEffect(() => {activate();}, [slots]);
  useEffect(() => {
    players.current.forEach((player, slot) => {
      if (player && slot === active && running) player.play().catch(() => {});
      else player?.pause();
    });
  }, [active, running]);
  useEffect(() => {
    if (selected !== slots[active]) queue(selected, true);
    else if (queued.current?.requested) {queued.current = null; switching.current = false;}
  }, [selected]);
  function progress(event, slot) {
    if (slot !== active || !running || items.length < 2 || switching.current) return;
    const player = event.currentTarget;
    if (player.duration - player.currentTime < 4) queue((slots[active] + 1) % items.length);
  }
  function ended(slot) {
    if (slot !== active || !running) return;
    if (items.length === 1) {
      players.current[slot].currentTime = 0;
      players.current[slot].play().catch(() => {});
      return;
    }
    switching.current = true;
    queue((slots[active] + 1) % items.length, true);
  }
  return <>
    {slots.map((index, slot) => index == null ? null : <video
      key={slot} ref={element => {players.current[slot] = element;}}
      className={`arcade-film ${slot === active ? 'is-current' : ''}`}
      data-composition={items[index].composition}
      src={film(items[index])} muted playsInline preload={running ? 'auto' : 'metadata'}
      poster={poster(items[index])}
      aria-label={`Recorded ${items[index].name} gameplay`} aria-hidden={slot !== active}
      onTimeUpdate={event => progress(event, slot)} onEnded={() => ended(slot)}
      onCanPlay={activate}
      onError={() => {if (queued.current?.slot === slot) {queued.current = null; switching.current = false; const current=players.current[active]; if(current && running) {current.currentTime=0;current.play().catch(() => {});}}}}
    />)}
    {items.length > 1 && <div className="arcade-reel" aria-label="Featured games">
      {items.map((item, index) => <button key={item.slug} title={item.name}
        aria-label={`Show ${item.name} gameplay`} aria-pressed={slots[active] === index}
        onClick={() => onChoose(index)}><span/></button>)}
    </div>}
  </>;
}

// Mobile Safari often declines to buffer the next short file until the current
// file has ended. Use one fast-start MP4 and seek inside it for direct choices.
export function MobileGameplayReel({items, running, onSelect, selected, onChoose}) {
  const player = useRef(null), current = useRef(selected), retry = useRef(null);
  current.current = selected;
  const key = mediaVersions['gameplay/mobile-hero-reel'];
  const source = `/assets/gameplay/mobile-hero-reel.mp4?v=${key.video}`;
  const image = `/assets/gameplay/mobile-hero-reel.jpg?v=${key.poster}`;
  function play() {
    const video = player.current;
    if (!video || !running) return;
    video.muted = true;
    video.play().catch(() => {
      clearTimeout(retry.current);
      retry.current = setTimeout(() => {
        if (player.current === video && running && video.readyState >= 2) video.play().catch(() => {});
      }, 350);
    });
  }
  function sync(event) {
    const index = mobileReelIndex(event.currentTarget.currentTime);
    if (index !== current.current) {
      current.current = index;
      onSelect(index);
    }
  }
  useEffect(() => {
    const video = player.current;
    if (!video) return;
    if (running) play(); else video.pause();
    return () => clearTimeout(retry.current);
  }, [running]);
  useEffect(() => {
    const video = player.current;
    if (!video || mobileReelIndex(video.currentTime) === selected) return;
    video.currentTime = mobileReelStart(selected) + .03;
    play();
  }, [selected]);
  return <>
    <video ref={player} className="arcade-film arcade-film-continuous is-current"
      src={source} poster={image} muted playsInline autoPlay={running} loop preload="auto"
      disablePictureInPicture aria-label="Recorded Slop mobile gameplay"
      onLoadedData={play} onCanPlay={play} onPlaying={sync} onTimeUpdate={sync}
      onWaiting={play}/>
    <div className="arcade-reel" aria-label="Featured games">
      {items.map((item, index) => <button key={item.slug} title={item.name}
        aria-label={`Show ${item.name} gameplay`} aria-pressed={selected === index}
        onClick={() => onChoose(index)}><span/></button>)}
    </div>
  </>;
}
