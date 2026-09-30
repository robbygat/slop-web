import {UUID} from './contracts.js';
export function profileShareUrl(profile){
 if(!UUID.test(profile?.id||''))return null;
 return `https://slop.game/#/social?player=${encodeURIComponent(profile.id)}`;
}
export function profileShareText(profile){
 const name=String(profile?.username||profile?.display_name||'me').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80);
 return `Add ${profile?.username?'@':''}${name} on Slop. One more game?`;
}
export function profileXIntent(profile){
 const url=profileShareUrl(profile);if(!url)return null;
 const params=new URLSearchParams({text:profileShareText(profile),url});
 return `https://x.com/intent/post?${params}`;
}
