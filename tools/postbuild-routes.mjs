import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {escapeHtml, gameRoutes, readPublishedSoftware, renderPlatformGame, renderSoftwareIndex, softwareCatalog} from './software-index.mjs';

const out=resolve(process.argv[2]||'dist');
const api='https://api.slop.game';
const publicKey='sb_publishable_hR6MXJRNM9VuADkU8z-2mg_K9t7FBQL';
const fallbackImage='https://slop.game/assets/brand/pick-your-slop.webp';
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

// GitHub Pages serves this same SPA document at /claimed-game-name while
// retaining the incoming address. Asset URLs in Vite's built index are absolute.
const app=await readFile(resolve(out,'index.html'),'utf8');
await writeFile(resolve(out,'404.html'),app);
const client=createClient(api,publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const games=await readPublishedSoftware(client);
const catalog=softwareCatalog(games);
const routes=gameRoutes(games);
for(const [route,{game,canonical}] of routes){
 const directory=resolve(out,route);
 await mkdir(directory,{recursive:true});
 await writeFile(resolve(directory,'index.html'),game.source==='app-platform'?renderPlatformGame(game):replaceMeta(app,game,canonical));
}
await mkdir(resolve(out,'games'),{recursive:true});
await writeFile(resolve(out,'games/index.html'),renderSoftwareIndex(catalog));
await writeFile(resolve(out,'games/catalog.json'),`${JSON.stringify(catalog,null,2)}\n`);
console.log(`Generated ${routes.size} HTTP-200 game routes and a complete ${catalog.count}-entry software index.`);
