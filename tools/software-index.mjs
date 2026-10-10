import {readPublicRoutePage, readPublicRouteRows} from './public-route-read.mjs';

export const SOFTWARE_INDEX_URL = 'https://slop.game/games/';
const origin = 'https://slop.game';
// Match the shipping native parser, not just the wider historical web grammar.
const nativeSlug = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const publicName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const reserved = new Set('home feed play games g r build studio quests social shop you activity settings connect download open invite profile mcp assets api auth privacy terms tos support delete-account help about newsite releases bridge 404 index favicon robots sitemap admin login signup logout account billing uploads downloads game-frame native-character native-wasm appearance service-worker sw'.split(' '));
const fail = message => new Error(`Software index incomplete: ${message}. Do not publish a partial index.`);

// Reviewed against mobile lib/models/game.dart and resolveDeepLinkGameForTesting
// in the 3.7.8 release source. grun is a stable platform identity outside games.
// Disabled multiplayer previews (for example air-hockey) are deliberately absent.
export const PLATFORM_SOFTWARE = Object.freeze([Object.freeze({
  slug: 'grun', name: 'Run Infinite',
  description: 'Rotate around a square tube in space, jump the gaps, outrun the shrinking ribbon.',
  persistent: false, supported_platforms: Object.freeze(['mobile']),
  category: null, source: 'app-platform',
})]);

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
export const routeFor = name => publicName.test(name) && !reserved.has(name) ? name : `g/${name}`;
export function universalGameUrl(slug) {
  if (typeof slug !== 'string' || !nativeSlug.test(slug)) throw fail(`invalid native game identity ${String(slug).slice(0, 130)}`);
  return `${origin}/play/${slug}/`;
}
export const canonicalGameUrl = game => `${origin}/${routeFor(game.public_name || game.slug)}`;

function validatePublishedGame(game) {
  universalGameUrl(game?.slug);
  if (game.status !== 'published' || game.media_delete_authorized !== false) throw fail(`non-public game ${game.slug}`);
  if (typeof game.name !== 'string' || !game.name.trim()) throw fail(`missing title for ${game.slug}`);
  if (game.description != null && typeof game.description !== 'string') throw fail(`invalid description for ${game.slug}`);
  if (game.persistent !== true && game.persistent !== false) throw fail(`missing World metadata for ${game.slug}`);
  if (!Array.isArray(game.supported_platforms) || !game.supported_platforms.length ||
      game.supported_platforms.some(platform => !['mobile', 'desktop'].includes(platform))) throw fail(`invalid platforms for ${game.slug}`);
}

// Injectable reads make completeness testable beyond the API's default row cap.
// An exact count, fixed order and identity checks turn partial/racing reads into
// a failed build rather than a successful deployment that silently omits games.
export async function collectPublishedSoftware({readPage, readNames, pageSize = 500}) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw fail('invalid catalog page size');
  const games = [], seen = new Set();
  let expected;
  for (let from = 0; ; from += pageSize) {
    const {rows, total} = await readPage(from, from + pageSize - 1);
    if (!Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) throw fail('invalid catalog page');
    if (expected === undefined) expected = total;
    if (total !== expected) throw fail('catalog changed during pagination; retry the build');
    const remaining = expected - from;
    if (rows.length !== Math.min(pageSize, Math.max(0, remaining))) throw fail(`truncated catalog page at ${from}`);
    for (const game of rows) {
      validatePublishedGame(game);
      if (seen.has(game.slug)) throw fail(`duplicate game identity ${game.slug}`);
      seen.add(game.slug); games.push(game);
    }
    if (games.length === expected) break;
  }
  const names = new Map();
  for (let from = 0; from < games.length; from += 100) {
    const batch = games.slice(from, from + 100).map(game => game.slug);
    const rows = await readNames(batch);
    if (!Array.isArray(rows)) throw fail('invalid public-name list');
    for (const row of rows) {
      if (!batch.includes(row.game_slug) || typeof row.name !== 'string' || !publicName.test(row.name) || names.has(row.game_slug)) throw fail('invalid public-name mapping');
      names.set(row.game_slug, row.name);
    }
  }
  return games.map(game => ({...game, public_name: names.get(game.slug) || null}));
}

export async function readPublishedSoftware(client) {
  return collectPublishedSoftware({
    readPage: (from, to) => readPublicRoutePage(client.from('games')
      .select('slug,name,description,thumb,status,media_delete_authorized,persistent,supported_platforms,category', {count: 'exact'})
      .eq('status', 'published').eq('media_delete_authorized', false).order('slug').range(from, to), `published games ${from + 1}–${to + 1}`),
    readNames: batch => readPublicRouteRows(client.rpc('game_public_names', {p_game_slugs: batch}), `public names for ${batch.length} games`),
  });
}

export function softwareCatalog(games, generatedAt = new Date().toISOString()) {
  const seen = new Set();
  const software = [...games, ...PLATFORM_SOFTWARE].map(game => {
    if (seen.has(game.slug)) throw fail(`platform/catalog identity collision ${game.slug}`);
    seen.add(game.slug);
    return {
      slug: game.slug, name: game.name, description: game.description?.trim() || null,
      category: game.category || null, type: game.persistent ? 'World' : 'Arcade',
      platforms: [...game.supported_platforms], source: game.source || 'published-catalog',
      url: universalGameUrl(game.slug),
      web_url: game.source === 'app-platform' ? null : canonicalGameUrl(game),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.slug.localeCompare(b.slug, 'en'));
  return {schema_version: 1, generated_at: generatedAt, url: SOFTWARE_INDEX_URL, count: software.length, software};
}

export function gameRoutes(games) {
  const routes = new Map();
  const add = (route, game, canonical) => {
    const prior = routes.get(route);
    if (prior && prior.game.slug !== game.slug) throw fail(`route collision ${route}`);
    routes.set(route, {game, canonical});
  };
  for (const game of games) {
    universalGameUrl(game.slug);
    const canonical = canonicalGameUrl(game);
    add(routeFor(game.public_name || game.slug), game, canonical);
    add(routeFor(game.slug), game, canonical);
    add(`play/${game.slug}`, game, canonical);
    add(`g/${game.slug}`, game, canonical);
  }
  for (const game of PLATFORM_SOFTWARE) {
    add(`play/${game.slug}`, game, universalGameUrl(game.slug));
    add(`g/${game.slug}`, game, universalGameUrl(game.slug));
  }
  return routes;
}

const pageStyle = `@font-face{font-family:Slop Sans;src:url('/assets/fonts/SlopSans-Latin.woff2') format('woff2');font-weight:100 1000;font-display:swap}*{box-sizing:border-box}body{margin:0;background:#10120f;color:#f2f4eb;font-family:Slop Sans,system-ui,sans-serif;line-height:1.6}main{max-width:1000px;margin:auto;padding:28px 24px 64px}nav,footer{display:flex;gap:20px;flex-wrap:wrap;align-items:center}nav{margin-bottom:48px}a{color:#c5f564;text-underline-offset:4px}a:focus-visible{outline:3px solid #c5f564;outline-offset:6px}h1{font-size:clamp(34px,6vw,58px);line-height:1.1;letter-spacing:-1px}h2{font-size:22px;line-height:1.3;margin:0 0 12px}p{margin:12px 0}.intro{max-width:760px}.muted,dt{color:#b7bcb1}.catalog{list-style:none;padding:0;margin:36px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px}.catalog li{padding:24px;border:1px solid #343b2d;border-radius:16px;overflow-wrap:anywhere}dl{font-size:14px;margin:18px 0}dt{display:inline}dd{display:inline;margin:0}dd:after{content:'';display:block}code{font-size:12px;overflow-wrap:anywhere}footer{border-top:1px solid #343b2d;padding-top:24px}.brand{font-size:23px;font-weight:800;text-decoration:none;margin-right:auto}.button{display:inline-block;background:#c5f564;color:#10120f;border-radius:12px;padding:12px 18px;font-weight:750;text-decoration:none}`;
function documentPage({title, description, canonical, body}) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Slop</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><link rel="icon" href="/favicon-slop-lime.svg"><style>${pageStyle}</style></head><body><main><nav aria-label="Main"><a class="brand" href="/">Slop.game</a><a href="/games/">Game index</a><a href="/support/">Support</a><a href="/#/download">Get Slop</a></nav>${body}<footer><span>AI Slop Inc.</span><a href="/privacy/">Privacy</a><a href="/tos/">Terms</a></footer></main></body></html>\n`;
}

export function renderSoftwareIndex(catalog) {
  const entries = catalog.software.map(game => `<li><article><h2><a href="${escapeHtml(game.url)}">${escapeHtml(game.name)}</a></h2><p>${escapeHtml(game.description || 'No description has been provided.')}</p><dl><dt>Type: </dt><dd>${escapeHtml(game.type)}</dd><dt>Platforms: </dt><dd>${escapeHtml(game.platforms.join(', '))}</dd>${game.category ? `<dt>Category: </dt><dd>${escapeHtml(game.category)}</dd>` : ''}<dt>Game ID: </dt><dd><code>${escapeHtml(game.slug)}</code></dd></dl><a href="${escapeHtml(game.url)}">Open game</a>${game.source === 'app-platform' ? '<p class="muted">Included in the Slop mobile app.</p>' : ''}</article></li>`).join('\n');
  return documentPage({title: 'Slop game index', description: 'The complete index of published Slop games and Worlds, their metadata, and permanent game links.', canonical: SOFTWARE_INDEX_URL,
    body: `<header class="intro"><p class="muted">Slop software catalog</p><h1>Every game. One index.</h1><p>${catalog.count} entries: all currently published catalog games plus the platform game included in the mobile app. Each title links directly to that game. Platform availability is listed separately.</p><p class="muted">Generated ${escapeHtml(catalog.generated_at)}. Refreshed with the website build. No sign-in or pagination is required.</p><a href="/games/catalog.json">Download metadata (JSON)</a></header><ul class="catalog">${entries}</ul>`});
}

export function renderPlatformGame(game) {
  return documentPage({title: game.name, description: game.description, canonical: universalGameUrl(game.slug),
    body: `<header class="intro"><p class="muted">Slop mobile game</p><h1>${escapeHtml(game.name)}</h1><p>${escapeHtml(game.description)}</p><p>This platform game is included in the Slop mobile app. With Slop installed, its permanent game link can open the game from a message or another app.</p><p><a class="button" href="/#/download">Get Slop</a></p><p><a href="/games/">Back to the complete game index</a></p><p class="muted">Game ID: <code>${escapeHtml(game.slug)}</code></p></header>`});
}
