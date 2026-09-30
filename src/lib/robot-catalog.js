export const ROBOTS = [
  ['core','Core','The original. Always up for one more.','#d8e7ff'],
  ['neko','Neko','Nine lives. One high score.','#f8c8ed'],
  ['clicky','Clicky','Built for a good time.','#ffe092'],
  ['gatekeeper','Gatekeeper','Here to protect the leaderboard.','#c9ceff'],
  ['noir','Noir','Quietly competitive.','#d4d7e1'],
  ['blocky','Blocky','A little rough around the pixels.','#cbe39e'],
  ['chip','High Roller','All in on the next run.','#ffc3bf'],
  ['stage-door','Stage Door','Every game is a grand entrance.','#d7c5ff'],
  ['marshal','Field Marshal','Reporting for playtime.','#c9ded0'],
  ['stamp','Stamp','Small shell. Big personality.','#f5ddb5'],
  ['homebody','Homebody','Make yourself at home.','#b6e4d9'],
  ['coin-op','Coin-Op','An entire arcade in one little friend.','#f4b6db'],
  ['bassline','Bassline','Play it loud.','#d6c5ff'],
  ['saucer','Saucer','Out of this world. Into this game.','#c8dafa'],
  ['gumdrop','Gumdrop','A seriously sweet competitor.','#f9c0e3'],
  ['liftoff','Liftoff','Next stop: the top.','#ffc5b3'],
  ['drizzle','Drizzle','A little cloud of good vibes.','#dceaff'],
  ['toasty','Toasty','Warm up. Go again.','#ffe4bd'],
  ['rawr','Rawr','Tiny arms. Huge ambitions.','#cbe4b6'],
  ['glowcap','Glowcap','Made for magical little moments.','#d6ccff'],
  ['updraft','Updraft','Catch a little air.','#c6e9f5'],
  ['wobble','Wobble','Finding balance is overrated.','#edd1ff'],
  ['brewster','Brewster','One more game before your coffee.','#e2c6a7'],
  ['prickles','Prickles','Soft on the inside.','#cdeba2'],
  ['hivemind','Hivemind','Buzzing for the next round.','#ffe095'],
  ['quackers','Quackers','Just ducking into a quick game.','#ffedaa'],
].map(([id,name,tagline,color])=>({id,name,tagline,color}));
export const ROBOT_IDS = new Set([...ROBOTS.map(r=>r.id),'carat']);
export const ROBOT_FINISHES = ['signature','chrome','pearl','midnight','bubblegum','sunny','mint','sky','tangerine','grape','cherry','gold','holo','carbon','candy','matte'];
export const ROBOT_FACES = ['wave','pixel','happy','cyclops','visor','hearts','stars','money','spiral','sleepy','wink','pulse','chart','cat','angry','dizzy','uwu','shades','equalizer','loading','kawaii','grille','slop'];
export const ROBOT_GLOWS = {signal:'#6f8dff',cyan:'#4fd8ff',mint:'#45e6b8',lime:'#9bf25a',gold:'#ffc857',amber:'#ff9a4d',red:'#ff4d6a',pink:'#ff6fd8',violet:'#b58cff',white:'#dde6ff',sunset:'#ff7a6b',aurora:'#45e6b8',ocean:'#4fd8ff',candy:'#ff6fd8',rainbow:'#ff4d6a'};
export function robotSpec(look, overrides={}) {
  const raw={...(look?.robot||deriveLegacyRobot(look)),...overrides};
  const shell=ROBOT_IDS.has(raw.shell)?raw.shell:'core';
  return {shell,finish:ROBOT_FINISHES.includes(raw.finish)?raw.finish:'signature',face:ROBOT_FACES.includes(raw.face)?raw.face:(shell==='core'?'slop':'happy'),glow:ROBOT_GLOWS[raw.glow]||(/^#[\da-f]{6}$/i.test(raw.glow||'')?raw.glow:(shell==='core'?'#c5f564':'#dde6ff')),glow2:({sunset:'#ffc857',aurora:'#b58cff',ocean:'#5b6cff',candy:'#4fd8ff',rainbow:'#45e6b8'})[raw.glow]||raw.glow2||null,rainbow:raw.glow==='rainbow'||raw.rainbow===true,line:['neon','solid','dashed','led','crt','tube','holo','glitch','scope'].includes(raw.line)?raw.line:'neon',fx:['none','scanlines','sparkle','rain','stars','hearts','grid'].includes(raw.fx)?raw.fx:'none',gear:['crown','halo','sprout','propeller','party','bow','antenna','bunny','horns','tophat','headset','flower'].includes(raw.gear)?raw.gear:'none',mood:'happy',gazeX:0,gazeY:0,talk:0,seed:.37};
}
// Match mobile's stable visual conversion for profiles made before robots.
// This is presentation only. Ownership always comes from my_slop_cosmetics.
export function deriveLegacyRobot(look){
 if(!look||!Object.keys(look).length)return {};
 const {palette='tangerine',hat='none',eyes='cyclops',mouth='smile',body='ghost',finish='jelly',pattern='none',aura='bubbles',eyeColor='ink',blush=true}=look;
 let h=0x811c9dc5;const seed=`slop-robot-v1:${palette}|${hat}|${eyes}|${mouth}|${body}|${finish}|${pattern}|${aura}|${eyeColor}|${blush}`;
 for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),0x01000193)>>>0;
 const pick=(salt,n)=>{let x=(h^Math.imul(0x9e3779b9,salt+1))>>>0;x^=x>>>16;x=Math.imul(x,0x85ebca6b)>>>0;x^=x>>>13;return (x&0x7fffffff)%n;};
 const shell=({cap:'gatekeeper',mintedBeret:'gatekeeper',antenna:'clicky',itCouldBeWorse:'clicky',star:'stage-door',mohawk:'marshal',chefPuff:'homebody',mushroom:'homebody',horns:'neko',bow:'neko',satinBow:'neko',butterflyClips:'neko'})[hat]||(mouth==='cat'||eyes==='kawaii'?'neko':eyes==='money'?'chip':['core','core','neko','clicky','gatekeeper','noir','blocky','chip','stage-door','stamp','homebody','marshal'][pick(1,12)]);
 const paint=({chrome:'chrome',hologram:'chrome',crystal:'chrome',clearGlass:'chrome',gold:'gold',firstBatch:'gold',obsidian:'midnight',galaxy:'midnight',pearl:'pearl'})[finish]||({tangerine:'tangerine',peach:'tangerine',ember:'tangerine',grape:'grape',lavender:'grape',ultraviolet:'grape',mint:'mint',seafoam:'mint',lime:'mint',toxic:'mint',bubblegum:'bubblegum',rose:'bubblegum',blueberry:'sky',aqua:'sky',void:'midnight',slate:'midnight',cocoa:'midnight',butter:'sunny',cherry:'cherry',porcelain:'pearl'})[palette]||'signature';
 const face=({heart:'hearts',star:'stars',sparkle:'stars',money:'money',spiral:'spiral',sleepy:'sleepy',wink:'wink',visor:'visor',kawaii:'happy',crescent:'happy',round:'pixel',wide:'pixel',dot:'pixel'})[eyes]||(['cat','uwu'].includes(mouth)?'cat':['wave','wave','wave','pixel','happy','cyclops'][pick(2,6)]);
 const glow=({mint:'mint',seafoam:'mint',toxic:'lime',lime:'lime',bubblegum:'pink',rose:'pink',grape:'violet',lavender:'violet',ultraviolet:'violet',aqua:'cyan',butter:'gold',tangerine:'amber',peach:'amber',ember:'red',cherry:'red'})[palette]||'signal';
 const gear=({crown:'crown',pearlTiara:'crown',globalChampion:'crown',halo:'halo',sprout:'sprout',blossomCrown:'sprout',propeller:'propeller',beanie:'propeller',ideaWizard:'party'})[hat]||(['satinBow','bow'].includes(hat)&&shell!=='neko'?'bow':'none');
 return {shell,finish:paint,face,glow,gear};
}
