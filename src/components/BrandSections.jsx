import React from 'react';
import {Icon} from './Icon.jsx';
export function CampaignSections(){return <>
  <section className="home-afterword" aria-label="More Slop"><a href="#/download"><img src="/assets/brand/pick-your-slop.webp" width="1254" height="1254" loading="lazy" alt="Pick your Slop. The complete character crew."/><span className="campaign-caption">Take Slop with you <Icon name="arrow" size={18}/></span></a><a href="#/quests"><img src="/assets/brand/play-for-the-crown.webp" width="1254" height="1254" loading="lazy" alt="Play for the crown. The Slop crew and its crowned champion."/><span className="campaign-caption">Your next challenge <Icon name="arrow" size={18}/></span></a></section>
  <section className="home-create"><div><h2>Got a game in you?</h2><p>Connect your coding app to Slop MCP.<br/>Make it, playtest it, put it out there.</p></div><a className="button" href="#/connect">Create with MCP <Icon name="arrow" size={18}/></a></section>
</>;}
