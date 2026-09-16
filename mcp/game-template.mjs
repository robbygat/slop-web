import {readFile} from 'node:fs/promises';
const index='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="slop-runtime" content="creator-v1"><title>Pocket Bounce</title></head><body><script src="slop.js"></script><script src="game.js"></script></body></html>';
const game=`const surface=Slop.create({background:'#faf3e8'}),ctx=surface.ctx;
let points=0,finished=false,announced=false;
Slop.onRestart(()=>{points=0;finished=false;Slop.score(0);});
Slop.loop(({time,width,height})=>{
 if(Slop.input.pressed&&!finished){points++;Slop.score(points);Slop.haptic('light');}
 ctx.fillStyle='#faf3e8';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#302a3d';ctx.textAlign='center';ctx.font='bold 28px system-ui';ctx.fillText('Pocket Bounce',width/2,height*.20);
 ctx.font='20px system-ui';ctx.fillText(points+' bounces',width/2,height*.30);
 const y=height*.56-Math.abs(Math.sin(time*2.4))*36;
 ctx.fillStyle='#faaa47';ctx.beginPath();ctx.arc(width/2,y,48,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#302a3d';ctx.font='17px system-ui';ctx.fillText('Tap 10 times to finish',width/2,height*.80);
 if(!announced){announced=true;Slop.ready();}
 if(points>=10&&!finished){finished=true;Slop.finished(points);}
});`;
export async function gameTemplate(){return {runtime:'creator-v1',instructions:'Start from these files. Keep slop.js unchanged and include the slop-runtime meta tag. Call Slop.ready only after the first usable rendered frame, Slop.score during play, and Slop.finished once at real game over. Use Slop.onRestart, Slop.loop and Slop.input so native/web pause, resume and touch controls work. Render gameplay on a canvas for a real captured cover and clip. Keep everything private until the owner explicitly submits for review.',files:{'index.html':index,'slop.js':await readFile(new URL('./runtime/creator-v1.js',import.meta.url),'utf8'),'game.js':game}};}
