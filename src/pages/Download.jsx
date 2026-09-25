import React from 'react';
import {Icon} from '../components/Icon.jsx';
import {appStoreUrl,googlePlayUrl} from '../lib/store-links.js';
import './download.css';
export default function Download(){
 return <div className="download-page"><header className="download-heading"><h1>Slop, on your phone.</h1><p>Play, make games and keep your Slop with you.<br/>One account on the web, iPhone and Android.</p></header>
  <div className="download-options"><section className="download-platform"><h2>iPhone</h2><p>Get Slop from the App Store.</p><a className="store-link" href={appStoreUrl} target="_blank" rel="noopener noreferrer"><Icon name="download"/><span>Download on the App Store</span><Icon name="arrow" size={18}/></a></section>
  <section className="download-platform"><h2>Android</h2><p>Get Slop from Google Play.</p><a className="store-link" href={googlePlayUrl} target="_blank" rel="noopener noreferrer"><Icon name="download"/><span>Get it on Google Play</span><Icon name="arrow" size={18}/></a></section></div>
  <div className="download-continue"><p>Already playing on the web? Sign in with the same account in the app.</p><a href="#/connect" className="inline-link">Connect a coding app <Icon name="arrow" size={18}/></a></div>
 </div>;
}
