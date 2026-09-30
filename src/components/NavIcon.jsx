import React from 'react';
import SlopMark from './SlopMark.jsx';

// Ported from the mobile app's SlopNavIcon / QuestNavIcon painters.
// Navigation has its own rounded, animated glyph family; utility icons stay quiet.
export default function NavIcon({name,size=28}) {
 if(name==='play')return <SlopMark className="slop-nav-glyph glyph-play"/>;
 const art={
  social:<><path className="nav-glyph-wash" d="M14 4.5C7 4.5 3.8 7.4 3.8 14.2C3.8 19 5.7 21.6 9.3 22.8L8.8 27.5Q13 26.3 16.3 23.6C24.9 23.6 28.2 20.6 28.2 14.2C28.2 7.3 24.8 4.5 18 4.5Z"/><path className="nav-mind" d="M9.2 14C11.5 8.8 13.8 19.2 16 14S20.5 8.8 22.8 14"/></>,
  quest:<g transform="translate(2 1) scale(1.02)"><path className="nav-glyph-wash" d="M10 5V10C4 13 3 20 7 23Q14 27 21 23C25 20 24 13 18 10V5Z" strokeWidth="2"/><rect x="9" y="2" width="10" height="4" rx="1.5" fill="currentColor" stroke="none"/><path d="M14 12L15.4 15.6 19 17 15.4 18.4 14 22 12.6 18.4 9 17 12.6 15.6Z" fill="currentColor" stroke="none"/></g>,
  code:<g transform="translate(16 20) rotate(-30)"><rect className="nav-glyph-wash" x="-2.6" y="-7" width="5.2" height="15" rx="2.5"/><path className="nav-glyph-wash" d="M-8-13Q-9.5-13-9.5-11.5V-7.5Q-9.5-6-8-6H5.5L9-9Q6.5-13 2.5-13Z"/></g>,
  shop:<><path className="nav-glyph-wash" d="M8.5 10H23.5Q25 10 25.2 12L26.1 24.2Q26.4 27.5 23 27.5H9Q5.6 27.5 5.9 24.2L6.8 12Q7 10 8.5 10Z"/><path d="M11.5 12V8.5C11.5 2.5 20.5 2.5 20.5 8.5V12"/></>,
  home:<><path className="nav-glyph-wash" d="m4 14 10-9a3 3 0 0 1 4 0l10 9-2 0v11a2 2 0 0 1-2 2h-5v-8h-6v8H8a2 2 0 0 1-2-2V14Z"/></>,
 };
 return <svg className={`slop-nav-glyph glyph-${name}`} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art[name]||art.home}</svg>;
}
