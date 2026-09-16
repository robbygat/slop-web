import React from 'react';
import {Icon} from '../components/Icon.jsx';
import {Notice,useAsync} from '../components/ui.jsx';
import './download.css';
export const appStore='https://apps.apple.com/us/app/slop-game/id6783292057';
export default function Download(){
 const release=useAsync(async()=>{const r=await fetch('/downloads/android-release.json');if(!r.ok)return null;return r.json();},[]);
 return <div className="download-page"><header className="download-heading"><h1>Slop, on your phone.</h1><p>Play, make games and keep your Slop with you.<br/>One account on the web, iPhone and Android.</p></header>
  <div className="download-options"><section className="download-platform"><h2>iPhone</h2><p>Get Slop from the App Store.</p><a className="store-link" href={appStore} target="_blank" rel="noreferrer"><Icon name="download"/><span>Download on the App Store</span><Icon name="arrow" size={18}/></a></section>
  <section className="download-platform"><h2>Android</h2><p>Install the latest Slop APK.</p>{release.data?<><a className="store-link" href={release.data.url} download><Icon name="download"/><span>Download APK</span><Icon name="arrow" size={18}/></a><p className="release-summary">Version {release.data.version} · {release.data.size}</p><details className="apk-details"><summary>Installation and release details</summary><p>Open the APK on your Android phone. If Android asks, allow installation from your browser.</p><p>Built {release.data.date}<br/>Android ARM64 · Android {release.data.minAndroid||'7.0'} or later</p><details><summary>Verify your download</summary><p>SHA-256</p><code className="checksum">{release.data.sha256}</code><p>Mobile source: <code>{release.data.commit}</code></p></details></details></>:<p className="apk-pending" role="status">{release.loading?'Checking the latest release…':'The next APK is being prepared.'}</p>}</section></div>
  <Notice error={release.error}/><div className="download-continue"><p>Already playing on the web? Sign in with the same account in the app.</p><a href="#/connect" className="inline-link">Connect a coding app <Icon name="arrow" size={18}/></a></div>
 </div>;
}
