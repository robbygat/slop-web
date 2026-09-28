import React from 'react';

// Original mark from JevBot's i-jev SVG, reused with the owner's direction.
export default function SlopMark({className=''}){
 return <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" fill="#FF5D24"/>
  <g transform="translate(6.4 6.4) scale(.8)">
   <path d="M52 21Q49 12 38 12H25Q9 12 9 28V36Q9 52 25 52H39Q55 52 55 36V30C51 38 45 37 41 31S33 25 29 32S22 39 18 34" fill="none" stroke="#000000" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
  </g>
 </svg>;
}
