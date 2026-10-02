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
 ctx.fillStyle='#302a3d';ctx.textAlign='center';ctx.font='bold 44px system-ui';ctx.fillText(points,width/2,height*.16);
 const y=height*.56-Math.abs(Math.sin(time*2.4))*36;
 ctx.fillStyle='#faaa47';ctx.beginPath();ctx.arc(width/2,y,48,0,Math.PI*2);ctx.fill();
 if(!points){ctx.fillStyle='#302a3d';ctx.font='bold 18px system-ui';ctx.fillText('Tap to bounce',width/2,height*.80);}
 if(!announced){announced=true;Slop.ready();}
 if(points>=10&&!finished){finished=true;Slop.finished(points);}
});`;
async function arcadeTemplate({target_platform='cross-platform'}={}){if(!Object.hasOwn(targets,target_platform))throw new Error('Choose mobile, desktop, or cross-platform.');const instructions=`Start from these files. ${targets[target_platform]} Keep slop.js unchanged and include both meta tags. Call Slop.ready only after the first usable rendered frame, Slop.score during play, and Slop.finished once at real game over. Use Slop.onRestart, Slop.loop and Slop.input so native/web pause, resume, pointer, keyboard and touch controls work. Render changing gameplay on a canvas so Slop can record real gameplay frames directly as a 30 fps H.264 MP4: 720×1280 portrait or 1280×720 landscape, plus a poster. Never convert a GIF into the feed video; GIFs are legacy compatibility only. Feed framing and HUD: preserve the full canvas with adaptive contain fitting across screen shapes, never crop gameplay or controls. Keep the player, targets and HUD inside the centered ~80% of the width and frame the camera/playfield slightly wide rather than tight. HUD = one big score or number near top-center plus at most 1-2 small icons (lives, a thin progress bar); no sentences, no \"SCORE:\"/\"LEVEL:\" labels, no stat panels in the corners. A control hint is at most 4 words and disappears on the first input; in-game callouts (combo, +10, PERFECT) are 1-2 words and fade quickly. Keep drafts private unless the owner explicitly submits for review or enables Auto-publish for this connection; publication still requires accepted recorded video. Sandbox rules: the game runs in an opaque-origin sandbox, so localStorage/sessionStorage/indexedDB throw and network requests are blocked; ship every file in the bundle (file names: letters, digits, _ or -, one html/js/css/json/svg/txt extension). The only external library is three.js r128 via Slop.three(); for 3D call Slop.create({renderer:'3d'}), render into surface.canvas with new THREE.WebGLRenderer({canvas:surface.canvas,preserveDrawingBuffer:true}) or recorded video and poster capture come back black. Slop captures the largest canvas, so keep one on-screen canvas that visibly moves even before input. Slop owns the start screen, pause and game-over card: do not draw a title, tap-to-start or play-again screen; at game over call Slop.finished once and keep animating until Slop.onRestart. slop.js calls preventDefault on pointerdown, so use pointer events, not mousedown or mouseup. On desktop, preventDefault wheel events so the page does not scroll, and give pointer lock a fallback. Slop.haptic is limited to 8 per second. Run slop_check_bundle before slop_send_draft.`;return {runtime:'creator-v1',target_platform,instructions,files:{'index.html':index(target_platform),'slop.js':await readFile(new URL('./runtime/creator-v1.js',import.meta.url),'utf8'),'slop-platform.json':JSON.stringify({target_platform}),'game.js':game}};}

const persistentGame=`async function boot(){
 const save=await Slop.persist({
  version:1,
  run:{floor:1,steps:0,__label:'Floor 1'},
  profile:{bestFloor:1,totalSteps:0},
  migrate(old,fromVersion,scope){return old;}
 });
 const surface=Slop.create({background:'#0c120d'}),ctx=surface.ctx;
 let finished=false,announced=false,keyHeld=false;
 Slop.onRestart(()=>{finished=false;keyHeld=false;Slop.score(0);});
 Slop.loop(({time,width,height})=>{
  const keyDown=Slop.input.keys.has('Space')||Slop.input.keys.has('Enter');
  if(!finished&&(Slop.input.pressed||keyDown&&!keyHeld)){
   save.run.steps++;save.profile.totalSteps++;save.commit();
   if(save.run.steps%5===0){
    save.run.floor++;save.run.__label='Floor '+save.run.floor;
    save.profile.bestFloor=Math.max(save.profile.bestFloor,save.run.floor);
    save.checkpoint(save.run.__label);
   }
   Slop.score(save.run.floor);
   if(save.run.floor>=5){finished=true;Slop.finished(save.run.floor);}
  }
  keyHeld=keyDown;
  ctx.fillStyle='#0c120d';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#c6ff5e';ctx.font='bold 40px system-ui';ctx.textAlign='center';
  ctx.fillText(save.run.floor,width/2,height*.16);
  ctx.beginPath();ctx.arc(width/2,height*.56-Math.abs(Math.sin(time*2))*25,38,0,Math.PI*2);ctx.fill();
  if(!announced){announced=true;Slop.ready();}
 });
}
boot().catch(error=>{console.error('Slop World could not open',error);});`;
export async function gameTemplate({target_platform='cross-platform',persistent=false}={}){
 const template=await arcadeTemplate({target_platform});
 if(!persistent)return template;
 const runtime='persistent-v1';
 return {
  runtime,target_platform,persistent:true,
  instructions:`Build a Slop World with durable run and profile progress. ${targets[target_platform]}
Keep slop.js unchanged and the slop-runtime persistent-v1 marker. Await Slop.persist({version,run,profile,migrate(old,fromVersion,scope)}) BEFORE Slop.ready and before gameplay starts. save.run and save.profile are live plain JSON objects; call save.commit after meaningful changes and save.checkpoint(label) at rooms/floors. Set save.run.__label for the platform Continue sheet. Do not draw a Continue, start or New run menu: Slop owns these. Slop.persist.newRun() is asynchronous; await it when your authored logic genuinely resets a run. Normal platform restart already clears run before Slop.onRestart; profile stays. Slop.finished(score) ends a genuine run and preserves profile. It is still a client-authored score, not proof of a reward.
Use Slop.create, Slop.loop(frame), Slop.input, Slop.onRestart and one real canvas. Call Slop.ready after the first usable rendered frame. Provide equivalent controls for the selected target, keep a terse centered HUD inside ~80% width, and preserve full gameplay with contain fitting. Capture a genuine moving H.264 MP4 plus poster, never synthetic gameplay.
Declare slop.spec.json persistent:true and first_load:[relative paths]. Include index.html, slop.js, game.js and every static HTML/CSS/module dependency needed before the first frame. Limits are decimal: 50,000,000 decoded bytes total, 8,000,000 per file, 400 files including metadata, and 5,000,000 first load. Arcade limits stay unchanged. run <=262,144 UTF-8 JSON bytes; profile <=131,072.
Text files stay strings. Binary .glb/.bin/.jpg/.webp/.ktx2/.ogg files use {encoding:'base64',data:'canonical base64'}; bytes and hashes are decoded bytes, not base64 length. Lazy load later zones with await Slop.asset('zones/forge.glb') -> {url,arrayBuffer()}; the host serves only verified files in this immutable release. Assets requested before ready must appear in first_load. Never fetch external URLs or use localStorage/sessionStorage/indexedDB. For 3D use await Slop.three() and await Slop.loadGLTF('model.glb'), self-contained GLB only; external GLTF resources and unsupported compressed decoders are rejected. KTX2 can be retrieved as bytes, not an advertised GLTF decoder. Set preserveDrawingBuffer:true for real captures.
Save commits are acknowledged after durable device storage; cloud sync is separate and may be offline. In-app closes await a flush; a browser/OS hard kill can only retain the most recent durable checkpoint, never promise zero loss from an unacknowledged write. Check slop_check_bundle before slop_send_draft. Keep drafts private until owner-approved publication. Worlds require deployed compatible host/authority; local template validation does not prove that rollout is live.`,
  files:{'index.html':index(target_platform).replace('creator-v1',runtime).replace('Pocket Bounce','Pocket World'),
   'slop.js':await readFile(new URL('./runtime/persistent-v1.js',import.meta.url),'utf8'),
   'slop-platform.json':JSON.stringify({target_platform}),
   'slop.spec.json':JSON.stringify({persistent:true,first_load:['index.html','slop.js','game.js','slop-platform.json']}),
   'game.js':persistentGame}
 };
}
