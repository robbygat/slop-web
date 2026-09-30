import React from 'react';

// Ported from the mobile app's SlopNavIcon / QuestNavIcon painters.
// Navigation has its own rounded, animated glyph family; utility icons stay quiet.
export default function NavIcon({name,size=28}) {
 const art={
  play:<path d="M11.4 6.8C8.8 5.3 7.8 7.1 7.7 10.1C7.4 14.2 7.4 18.2 7.8 22C8 25 9.2 26.3 11.9 24.8C16.5 22.4 21.1 20 24.6 17.6C26.2 16.5 26.1 15.2 24.5 14.1C20.5 11.5 15.5 8.9 11.4 6.8Z" fill="currentColor" stroke="none"/>,
  social:<><path className="nav-glyph-wash" d="M14 4.5C7 4.5 3.8 7.4 3.8 14.2C3.8 19 5.7 21.6 9.3 22.8L8.8 27.5Q13 26.3 16.3 23.6C24.9 23.6 28.2 20.6 28.2 14.2C28.2 7.3 24.8 4.5 18 4.5Z"/><path className="nav-mind" d="M9.2 14C11.5 8.8 13.8 19.2 16 14S20.5 8.8 22.8 14"/></>,
  quest:<g transform="translate(2 1) scale(1.02)"><path className="nav-glyph-wash" d="M10 5V10C4 13 3 20 7 23Q14 27 21 23C25 20 24 13 18 10V5Z" strokeWidth="2"/><rect x="9" y="2" width="10" height="4" rx="1.5" fill="currentColor" stroke="none"/><path d="M14 12L15.4 15.6 19 17 15.4 18.4 14 22 12.6 18.4 9 17 12.6 15.6Z" fill="currentColor" stroke="none"/></g>,
  code:<g transform="translate(16 20) rotate(-30)"><rect className="nav-glyph-wash" x="-2.6" y="-7" width="5.2" height="15" rx="2.5"/><path className="nav-glyph-wash" d="M-8-13Q-9.5-13-9.5-11.5V-7.5Q-9.5-6-8-6H5.5L9-9Q6.5-13 2.5-13Z"/></g>,
  shop:<><path className="nav-glyph-wash" d="M8.5 10H23.5Q25 10 25.2 12L26.1 24.2Q26.4 27.5 23 27.5H9Q5.6 27.5 5.9 24.2L6.8 12Q7 10 8.5 10Z"/><path d="M11.5 12V8.5C11.5 2.5 20.5 2.5 20.5 8.5V12"/></>,
  home:<><path d="M11 11 7 7M21 11l4-4M11 21l-4 4m14-4 4 4"/><rect className="nav-glyph-wash" x="8" y="8" width="16" height="16" rx="6"/><path className="nav-mind" d="M12 16Q14 12 16 16T20 16"/><g fill="currentColor" stroke="none"><circle cx="5" cy="5" r="3"/><circle cx="27" cy="5" r="3"/><circle cx="5" cy="27" r="3"/><circle cx="27" cy="27" r="3"/></g></>,
 };
 return <svg className={`slop-nav-glyph glyph-${name}`} width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art[name]||art.home}</svg>;
}
