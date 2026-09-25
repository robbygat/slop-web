import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const out=resolve(process.argv[2]||'dist');
const api='https://api.slop.game';
const publicKey='sb_publishable_hR6MXJRNM9VuADkU8z-2mg_K9t7FBQL';
const fallbackImage='https://slop.game/assets/mobile/slop.png';
const slug=/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
const publicName=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const reserved=new Set('home feed play games g r build studio social shop you activity settings connect download open invite profile mcp assets api auth privacy terms tos support delete-account help about newsite releases bridge 404 index favicon robots sitemap admin login signup logout account billing uploads downloads game-frame native-character native-wasm appearance service-worker sw'.split(' '));

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function replaceMeta(html,game,canonical){
 const title=escapeHtml(`${game.name||'Play a game'} · Slop`);
 const description=escapeHtml((game.description||'Play this community-made game on Slop.').trim().slice(0,240));
 const image=typeof game.thumb==='string'&&/^https:\/\/(?:api\.slop\.game|yqlolbebqfsodqgjlbeh\.supabase\.co)\//.test(game.thumb)?escapeHtml(game.thumb):fallbackImage;
 const url=escapeHtml(canonical);
 return html
  .replace(/<title>[^<]*<\/title>/,`<title>${title}</title>`)
  .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${description}">`)
  .replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${title}">`)
  .replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${description}">`)
  .replace(/<meta property="og:image" content="[^"]*">/,`<meta property="og:image" content="${image}">`)
  .replace(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${url}">`)
  .replace(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${url}">`);
}
function routeFor(name){return publicName.test(name)&&!reserved.has(name)?name:`g/${name}`;}
async function publishedGames(){
 const client=createClient(api,publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const games=[];
 for(let from=0;;from+=500){
  const {data,error}=await client.from('games').select('slug,name,description,thumb').eq('status','published').eq('media_delete_authorized',false).order('slug').range(from,from+499);
  if(error)throw error;
  games.push(...data);
  if(data.length<500)break;
 }
 const names=new Map();
 for(let index=0;index<games.length;index+=100){
  const batch=games.slice(index,index+100).map(game=>game.slug);
  const {data,error}=await client.rpc('game_public_names',{p_game_slugs:batch});
  if(error)throw error;
  for(const row of data||[])if(slug.test(row.game_slug)&&publicName.test(row.name))names.set(row.game_slug,row.name);
 }
 return games.filter(game=>slug.test(game.slug)).map(game=>({...game,public_name:names.get(game.slug)||null}));
}

// GitHub Pages serves this same SPA document at /claimed-game-name while
// retaining the incoming address. Asset URLs in Vite's built index are absolute.
const app=await readFile(resolve(out,'index.html'),'utf8');
await writeFile(resolve(out,'404.html'),app);
const routes=new Map();
for(const game of await publishedGames()){
 const canonicalName=game.public_name||game.slug;
 const canonical=`https://slop.game/${routeFor(canonicalName)}`;
 routes.set(routeFor(canonicalName),{game,canonical});
 routes.set(routeFor(game.slug),{game,canonical});
}
for(const [route,{game,canonical}] of routes){
 const directory=resolve(out,route);
 await mkdir(directory,{recursive:true});
 await writeFile(resolve(directory,'index.html'),replaceMeta(app,game,canonical));
}
console.log(`Generated ${routes.size} HTTP-200 game routes.`);
