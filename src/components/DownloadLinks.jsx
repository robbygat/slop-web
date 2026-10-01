import React from 'react';
import androidRelease from '../../public/downloads/android-release.json';
export const appStoreUrl='https://apps.apple.com/us/app/slop-game/id6783292057';
export default function DownloadLinks({compact=false}){return <div className="download-pair" aria-label="Download Slop">
 <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="Download Slop on the App Store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.2 12.8c0-2.7 2.2-4 2.3-4.1a5 5 0 0 0-4-2.2c-1.7-.2-3.3 1-4.1 1-.9 0-2.2-1-3.6-1-1.9 0-3.6 1.1-4.6 2.8-2 3.4-.5 8.5 1.4 11.2.9 1.3 2 2.8 3.5 2.7 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9 2.5-1.3 3.4-2.7a12 12 0 0 0 1.6-3.3 4.7 4.7 0 0 1-3.2-4.4ZM14.4 4.7A4.7 4.7 0 0 0 15.5 1a4.9 4.9 0 0 0-3.3 1.7 4.4 4.4 0 0 0-1.1 3.5 4 4 0 0 0 3.3-1.5Z"/></svg><span>{compact?'iOS':'App Store'}</span></a>
 <a href={androidRelease.url} download={androidRelease.file} aria-label="Download Slop APK for Android"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7-2-3m12 3 2-3M4 12a8 8 0 0 1 16 0v7H4Z"/><path d="M8 10h.01M16 10h.01" strokeWidth="3"/></svg><span>{compact?'APK':'Android APK'}</span></a>
</div>;}
