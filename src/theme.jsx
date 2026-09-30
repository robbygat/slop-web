import React,{useEffect,useState} from 'react';
import {Icon} from './components/Icon.jsx';
const modes=['light','dark','system'];
export function Appearance({compact=false}){
 const[mode,setMode]=useState(()=>{try{return modes.includes(localStorage.getItem('slop.appearance'))?localStorage.getItem('slop.appearance'):'system';}catch{return 'system';}});
 useEffect(()=>{const sync=e=>{if(modes.includes(e.detail))setMode(e.detail);};window.addEventListener('slop-appearance-change',sync);return()=>window.removeEventListener('slop-appearance-change',sync);},[]);
 const choose=value=>{if(modes.includes(value)){setMode(value);window.dispatchEvent(new CustomEvent('slop-appearance-change',{detail:value}));}};
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=mode==='system'?(media.matches?'dark':'light'):mode;document.documentElement.style.colorScheme=document.documentElement.dataset.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#172019':'#faf9f0');};apply();try{localStorage.setItem('slop.appearance',mode);}catch{}media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[mode]);
 if(compact)return <label className="masthead-theme"><Icon name={mode==='dark'?'moon':mode==='light'?'sun':'appearance'} size={20}/><select aria-label="Color theme" value={mode} onChange={e=>choose(e.target.value)}><option value="light">Light mode</option><option value="dark">Dark mode</option><option value="system">Match device</option></select></label>;
 return <div className="appearance-buttons" role="group" aria-label="Appearance">{modes.map(value=><button type="button" key={value} aria-label={value==='system'?'Use system appearance':`Use ${value} theme`} aria-pressed={mode===value} title={value==='system'?'System':value==='light'?'Light':'Dark'} onClick={()=>choose(value)}><Icon name={value==='dark'?'moon':value==='light'?'sun':'appearance'} size={17}/></button>)}</div>;
}
