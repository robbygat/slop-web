// Synthetic local values only; no rewards, score submission or authored game.
async function boot(){
 const save=await Slop.persist({version:1,run:{steps:0,__label:'Local room 1'},profile:{visits:0}});
 const surface=Slop.create({background:'#0c120d'}),ctx=surface.ctx;let held=false,ready=false;
 Slop.onRestart(()=>{held=false;});
 Slop.loop(({time,width,height})=>{
  const down=Slop.input.keys.has('Space');
  if(Slop.input.pressed||(down&&!held)){
   save.run.steps++;save.profile.visits++;save.run.__label='Local room '+(save.run.steps+1);
   save.checkpoint(save.run.__label).catch(console.error);
  }
  held=down;ctx.fillStyle='#0c120d';ctx.fillRect(0,0,width,height);ctx.textAlign='center';
  ctx.fillStyle='#c6ff5e';ctx.font='bold 26px system-ui';ctx.fillText('Run '+save.run.steps,width/2,height*.25);
  ctx.fillStyle='#fff';ctx.font='18px system-ui';ctx.fillText('Profile '+save.profile.visits,width/2,height*.34);
  ctx.fillText('Tap or press Space',width/2,height*.78);
  ctx.fillStyle='#c6ff5e';ctx.beginPath();ctx.arc(width/2+Math.sin(time)*30,height*.55,28,0,Math.PI*2);ctx.fill();
  if(!ready){ready=true;Slop.ready();}
 });
}
boot().catch(console.error);
