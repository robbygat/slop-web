import {readFile} from 'node:fs/promises';
const targets={
 mobile:'Build for a portrait phone viewport. Use touch-first controls, mobile safe areas, and never require a keyboard or mouse.',
 desktop:'Build for a responsive desktop viewport. Use keyboard and mouse controls and make the complete playfield fit without clipping.',
 'cross-platform':'Build one responsive game for phone and desktop. Provide equivalent touch controls and keyboard/mouse controls over one shared game state.',
};
const index=target=>'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="slop-runtime" content="creator-v1"><meta name="slop-target" content="'+target+'"><title>Pocket Bounce</title></head><body><script src="slop.js"></script><script src="game.js"></script></body></html>';
const game=`const surface=Slop.create({background:'#faf3e8'}),ctx=surface.ctx;
let points=0,finished=false,announced=false,keyHeld=false;
Slop.onRestart(()=>{points=0;finished=false;keyHeld=false;Slop.score(0);});
Slop.loop(({time,width,height})=>{
 const keyDown=Slop.input.keys.has('Space')||Slop.input.keys.has('Enter');
 if((Slop.input.pressed||keyDown&&!keyHeld)&&!finished){points++;Slop.score(points);Slop.haptic('light');}
 keyHeld=keyDown;
 ctx.fillStyle='#faf3e8';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#302a3d';ctx.textAlign='center';ctx.font='bold 28px system-ui';ctx.fillText('Pocket Bounce',width/2,height*.20);
 ctx.font='20px system-ui';ctx.fillText(points+' bounces',width/2,height*.30);
 const y=height*.56-Math.abs(Math.sin(time*2.4))*36;
 ctx.fillStyle='#faaa47';ctx.beginPath();ctx.arc(width/2,y,48,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#302a3d';ctx.font='17px system-ui';ctx.fillText('Tap 10 times to finish',width/2,height*.80);
 if(!announced){announced=true;Slop.ready();}
 if(points>=10&&!finished){finished=true;Slop.finished(points);}
});`;
export async function gameTemplate({target_platform='cross-platform'}={}){if(!Object.hasOwn(targets,target_platform))throw new Error('Choose mobile, desktop, or cross-platform.');const instructions=`Start from these files. ${targets[target_platform]} Keep slop.js unchanged and include both meta tags. Call Slop.ready only after the first usable rendered frame, Slop.score during play, and Slop.finished once at real game over. Use Slop.onRestart, Slop.loop and Slop.input so native/web pause, resume, pointer, keyboard and touch controls work. Render changing gameplay on a canvas so Slop can capture a real moving GIF. Keep everything private until the owner explicitly submits for review.`;return {runtime:'creator-v1',target_platform,instructions,files:{'index.html':index(target_platform),'slop.js':await readFile(new URL('./runtime/creator-v1.js',import.meta.url),'utf8'),'slop-platform.json':JSON.stringify({target_platform}),'game.js':game}};}
