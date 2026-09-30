import {profileBackdrop} from './profile-banners.js';
import {robotSpec} from './robot-catalog.js';
import {profileShareUrl} from './profile-sharing.js';
import meta from '../data/robots.json';

const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The card artwork could not load. Try again.'));img.src=src;});
function cover(ctx,img,x,y,w,h){const scale=Math.max(w/img.width,h/img.height);ctx.drawImage(img,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);}
function fitText(ctx,text,x,y,width,size,weight=650){ctx.font=`${weight} ${size}px "Slop Sans", sans-serif`;while(ctx.measureText(text).width>width&&size>28){size-=2;ctx.font=`${weight} ${size}px "Slop Sans", sans-serif`;}ctx.fillText(text,x,y,width);}

/** A real 1080 × 1920 story card with the equipped shell, face, world and profile QR. */
export async function drawProfileCard(canvas,profile){
 const url=profileShareUrl(profile);if(!url)throw new Error('Open a public profile to make its card.');
 const spec=robotSpec(profile.slop_look),screen=meta.shells[spec.shell].screen;
 const [world,shell,logo,{drawFace},QR]=await Promise.all([image(profileBackdrop(profile.profile_banner_id)),image(`/assets/robots/shells/${spec.shell}/${spec.finish}.webp`),image('/assets/brand/slop.svg'),import('../robots/mobile/face2d.ts'),import('qrcode')]);
 await document.fonts.ready;canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#f6f7ee';ctx.fillRect(0,0,1080,1920);
 ctx.save();ctx.beginPath();ctx.roundRect(44,44,992,1832,52);ctx.clip();
 cover(ctx,world,44,44,992,1260);
 const shade=ctx.createLinearGradient(0,600,0,1320);shade.addColorStop(0,'#10221700');shade.addColorStop(1,'#102217');ctx.fillStyle=shade;ctx.fillRect(44,600,992,740);
 ctx.fillStyle='#c5f564';ctx.fillRect(44,1290,992,586);
 ctx.fillStyle='#fff';ctx.textAlign='left';fitText(ctx,'Slop.game',105,160,650,58,750);
 ctx.strokeStyle='#ffffff80';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(105,225,870,960,400);ctx.stroke();
 ctx.drawImage(shell,100,295,880,880);
 const face=document.createElement('canvas');face.width=320;face.height=Math.round(320/screen.aspect);drawFace(face,spec,screen.aspect,screen.radius,screen.shape==='circle',1.2);
 const quad=screen.quad.map(([x,y])=>[x*640,y*640]);
 ctx.save();ctx.translate(100,295);ctx.scale(880/640,880/640);
 const triangle=(a,b,c,sa,sb,sc)=>{
  const d=sa[0]*(sb[1]-sc[1])+sb[0]*(sc[1]-sa[1])+sc[0]*(sa[1]-sb[1]);
  const coeff=v=>[(v[0]*(sb[1]-sc[1])+v[1]*(sc[1]-sa[1])+v[2]*(sa[1]-sb[1]))/d,(v[0]*(sc[0]-sb[0])+v[1]*(sa[0]-sc[0])+v[2]*(sb[0]-sa[0]))/d,(v[0]*(sb[0]*sc[1]-sc[0]*sb[1])+v[1]*(sc[0]*sa[1]-sa[0]*sc[1])+v[2]*(sa[0]*sb[1]-sb[0]*sa[1]))/d];
  const x=coeff([a[0],b[0],c[0]]),y=coeff([a[1],b[1],c[1]]);ctx.save();ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineTo(...c);ctx.closePath();ctx.clip();ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(face,0,0);ctx.restore();
 };
 triangle(quad[0],quad[1],quad[2],[0,0],[face.width,0],[face.width,face.height]);triangle(quad[0],quad[2],quad[3],[0,0],[face.width,face.height],[0,face.height]);ctx.restore();
 ctx.fillStyle='#fff';fitText(ctx,profile.display_name||profile.username||'Slop player',105,1165,870,94);fitText(ctx,`@${profile.username||'player'}`,108,1230,860,36,450);
 ctx.fillStyle='#16271d';fitText(ctx,'One more game?',105,1410,830,79);fitText(ctx,'Add me on Slop.',108,1472,800,36,450);
 const qr=document.createElement('canvas');await (QR.default||QR).toCanvas(qr,url,{width:230,margin:1,errorCorrectionLevel:'M',color:{dark:'#16271d',light:'#c5f564'}});ctx.drawImage(qr,755,1580,230,230);
 ctx.drawImage(logo,97,1580,120,120);fitText(ctx,'Find your people.',105,1760,600,33,500);fitText(ctx,'Play for the crown.',105,1810,600,33,500);ctx.restore();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Your browser could not save this card.');
 return new File([blob],`slop-${String(profile.username||'player').replace(/[^a-z0-9_-]/gi,'-')}-story.png`,{type:'image/png'});
}
