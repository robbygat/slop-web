import React from 'react';
import './app-download-bar.css';

const appStore='https://apps.apple.com/us/app/slop-game/id6783292057';
const android='https://github.com/robbygat/slop-web/releases/download/android-3.7.5-build-2051/Slop-3.7.5-build-2051-universal.apk';

function AppleMark(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.2 12.8c0-2.7 2.2-4 2.3-4.1a5 5 0 0 0-4-2.2c-1.7-.2-3.3 1-4.1 1-.9 0-2.2-1-3.6-1-1.9 0-3.6 1.1-4.6 2.8-2 3.4-.5 8.5 1.4 11.2.9 1.3 2 2.8 3.5 2.7 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9 2.5-1.3 3.4-2.7a12 12 0 0 0 1.6-3.3 4.7 4.7 0 0 1-3.2-4.4ZM14.4 4.7A4.7 4.7 0 0 0 15.5 1a4.9 4.9 0 0 0-3.3 1.7 4.4 4.4 0 0 0-1.1 3.5 4 4 0 0 0 3.3-1.5Z"/></svg>}
function AndroidMark(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.2 6.8-1.5-2.5m11.1 2.5 1.5-2.5M5.4 9.2h13.2M7 7h10a2 2 0 0 1 2 2v7.4a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 16.4V9a2 2 0 0 1 2-2Zm1.1 11v3m7.8-3v3M5 11H2.8v5.5M19 11h2.2v5.5"/><circle cx="8.5" cy="10.3" r=".7" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.3" r=".7" fill="currentColor" stroke="none"/></svg>}

export default function AppDownloadBar(){return <section className="home-app-download" aria-label="Download the Slop app">
 <img src="/assets/mobile/slop.png" alt="Slop app icon"/>
 <div className="home-app-copy"><strong>Take Slop with you.</strong><span>Same games. Same account.</span></div>
 <div className="home-app-actions">
  <a href={appStore} target="_blank" rel="noreferrer" aria-label="Download Slop on the App Store"><AppleMark/><span><small>Download on the</small>App Store</span></a>
  <a href={android} download="Slop-3.7.5-build-2051-universal.apk" aria-label="Download Slop APK for Android"><AndroidMark/><span><small>Download for</small>Android</span></a>
 </div>
</section>}
