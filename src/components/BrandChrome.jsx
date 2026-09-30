import React,{useEffect,useRef} from 'react';
import {Button,Slop} from './ui.jsx';
import NavIcon from './NavIcon.jsx';
import SlopMark from './SlopMark.jsx';
import DownloadLinks from './DownloadLinks.jsx';
import {Appearance} from '../theme.jsx';
import ActivityLink from './ActivityLink.jsx';
import './site-chrome.css';

export function BrandHeader({user,profile,signIn,navigation}){
 const header=useRef(null);
 useEffect(()=>{const node=header.current;const update=()=>document.documentElement.style.setProperty('--site-chrome-height',`${node.getBoundingClientRect().height}px`);const ro=new ResizeObserver(update);ro.observe(node);update();return()=>ro.disconnect();},[]);
 return <header className={`site-masthead ${user?'is-member':'is-guest'}`} ref={header}><a className="masthead-brand" href="#/home" aria-label="Slop.game home"><SlopMark/><span>Slop.game</span></a><div className="masthead-navigation">{navigation}</div><div className="masthead-actions"><Appearance compact/><ActivityLink ownerId={user?.id}/><a className="masthead-shop" href="#/shop" aria-label="Shop" title="Shop"><NavIcon name="shop" size={22}/><span>Shop</span></a><a className="masthead-avatar" href="#/you" aria-label="Your profile"><Slop look={profile?.slop_look} avatar={profile?.avatar_url} loading="eager" alt=""/></a>{!user&&<Button variant="small dark" className="masthead-signin" onClick={signIn}>Sign in</Button>}</div></header>;
}
export function BrandFooter(){
 return <footer className="site-footer compact-footer">
  <div className="footer-main"><a className="footer-brand" href="#/home" aria-label="Slop.game home"><SlopMark/><span>Slop.game</span></a><nav className="footer-links" aria-label="Footer"><a href="#/download">Get the app</a><a href="#/connect">Create</a><a href="#/shop">Shop</a><a href="/support.html">Support</a></nav><DownloadLinks/></div>
  <div className="footer-bottom"><a className="footer-company" href="https://aislopinc.com" target="_blank" rel="noopener noreferrer">© {new Date().getFullYear()} AI Slop Inc.</a><nav aria-label="Legal"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav><Appearance/></div>
 </footer>;
}
