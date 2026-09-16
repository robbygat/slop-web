import React,{useEffect,useState} from 'react';
import {Icon} from './components/Icon.jsx';
const modes=['light','dark','system'];
export function Appearance(){
 const[mode,setMode]=useState(()=>{try{return modes.includes(localStorage.getItem('slop.appearance'))?localStorage.getItem('slop.appearance'):'system';}catch{return 'system';}});
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=mode==='system'?(media.matches?'dark':'light'):mode;document.documentElement.style.colorScheme=document.documentElement.dataset.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#18171d':'#fbf8f2');};apply();try{localStorage.setItem('slop.appearance',mode);}catch{}media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[mode]);
 return <div className="appearance-buttons" role="group" aria-label="Appearance">{modes.map(value=><button type="button" key={value} aria-label={value==='system'?'Use system appearance':`Use ${value} theme`} aria-pressed={mode===value} title={value==='system'?'System':value==='light'?'Light':'Dark'} onClick={()=>setMode(value)}><Icon name={value==='dark'?'moon':value==='light'?'sun':'appearance'} size={17}/></button>)}</div>;
}
