import React from 'react';
import {Icon} from '../components/Icon.jsx';
import {useAndroidRelease} from '../components/useAndroidRelease.js';
import './download.css';
export const appStore='https://apps.apple.com/us/app/slop-game/id6783292057';
export default function Download(){
 const release=useAndroidRelease();
 return <div className="download-page"><header className="download-heading"><div><h1>A whole arcade.<br/>In your pocket.</h1><p>Play, chase crowns, and bring the whole crew.<br/>One account. Every screen.</p></div><img src="/assets/brand/pick-your-slop.webp" width="1254" height="1254" alt="Pick your Slop. The full character crew."/></header>
  <div className="download-options"><section className="download-platform"><h2>iPhone</h2><p>Get Slop from the App Store.</p><a className="store-link" href={appStore} target="_blank" rel="noreferrer"><Icon name="download"/><span>Download on the App Store</span><Icon name="arrow" size={18}/></a></section>
  <section className="download-platform"><h2>Android</h2><p>Download the APK directly to your Android phone.</p><a className="store-link" href={release.url} download={release.file}><Icon name="download"/><span>Download Slop for Android</span><Icon name="arrow" size={18}/></a><p className="release-summary">APK · Version {release.version} · Build {release.build} · {release.size}</p><details className="apk-details"><summary>Installation and release details</summary><p>Open the downloaded APK. If Android asks, allow installation from your browser, then choose Install.</p><p>Built {release.date}<br/>{release.architectures||'Android ARM64'} · Android {release.minAndroid||'7.0'} or later</p><details><summary>Verify your download</summary><p>SHA-256</p><code className="checksum">{release.sha256}</code>{release.commit&&<p>Mobile source: <code>{release.commit}</code></p>}</details></details></section></div>
  <div className="download-continue"><p>Already playing on the web? Sign in with the same account in the app.</p><a href="#/connect" className="inline-link">Connect a coding app <Icon name="arrow" size={18}/></a></div>
 </div>;
}
