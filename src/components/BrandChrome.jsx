import React,{useEffect,useRef,useState} from 'react';
import {Button,Slop} from './ui.jsx';
import {Icon} from './Icon.jsx';
import NavIcon from './NavIcon.jsx';
import SlopMark from './SlopMark.jsx';
import RobotPortrait from './RobotPortrait.jsx';
import DownloadLinks from './DownloadLinks.jsx';
import {Appearance} from '../theme.jsx';
import ActivityLink from './ActivityLink.jsx';
import './site-chrome.css';

export function BrandHeader({user,profile,signIn,navigation}){
 const header=useRef(null);
 useEffect(()=>{const node=header.current;const update=()=>document.documentElement.style.setProperty('--site-chrome-height',`${node.getBoundingClientRect().height}px`);const ro=new ResizeObserver(update);ro.observe(node);update();return()=>ro.disconnect();},[]);
 return <header className="site-masthead" ref={header}><a className="masthead-brand" href="#/home" aria-label="Slop.game home"><SlopMark/><span>Slop.game</span></a><div className="masthead-navigation">{navigation}</div><div className="masthead-actions"><Appearance compact/><ActivityLink ownerId={user?.id}/><a className="masthead-shop" href="#/shop"><NavIcon name="shop" size={22}/><span>Shop</span></a><a className="masthead-download" href="#/download">Get the app <Icon name="arrow" size={16}/></a><a className="masthead-avatar" href="#/you" aria-label="Your profile"><Slop look={profile?.slop_look} avatar={profile?.avatar_url} loading="eager" alt=""/></a>{!user&&<Button variant="small dark" onClick={signIn}>Sign in</Button>}</div></header>;
}
export function BrandFooter(){
 const root=useRef(null),[visible,setVisible]=useState(false);
 useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));observer.observe(root.current);return()=>observer.disconnect();},[]);
 return <footer className={`site-footer ${visible?'is-visible':''}`} ref={root}>
  <div className="footer-invitation"><h2>One more?<br/><span>Thought so.</span></h2><div><p>Your next favorite.<br/>Always in your pocket.</p><DownloadLinks/></div></div>
  <a className="footer-universe" href="#/home" aria-label="Back to Slop.game home"><span className="footer-orbit"/><SlopMark/><RobotPortrait shell="neko" animated={visible} className="footer-floater float-neko"/><RobotPortrait shell="core" face="slop" glow="lime" animated={visible} className="footer-floater float-core"/><RobotPortrait shell="liftoff" animated={visible} className="footer-floater float-liftoff"/><span className="footer-wordmark">Slop.game</span></a>
  <div className="footer-bottom"><a href="https://aislopinc.com" target="_blank" rel="noopener noreferrer">© {new Date().getFullYear()} AI Slop Inc.</a><nav aria-label="Footer"><a href="#/connect">Create</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/support.html">Support</a></nav><Appearance/></div>
 </footer>;
}
