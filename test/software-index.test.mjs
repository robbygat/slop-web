import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectPublishedSoftware, gameRoutes, PLATFORM_SOFTWARE, readPublishedSoftware, renderPlatformGame, renderSoftwareIndex, softwareCatalog, universalGameUrl} from '../tools/software-index.mjs';

const game = (slug, overrides = {}) => ({slug, name: `Game ${slug}`, description: 'A real game description.',
  status: 'published', media_delete_authorized: false, persistent: false, supported_platforms: ['mobile'], category: null, ...overrides});
const timestamp = '2026-10-11T00:00:00.000Z';
function reader(rows, options = {}) {
  const pages = [], names = [];
  return {pages, names, options: {
    readPage: async (from, to) => {pages.push([from, to]); return {rows: rows.slice(from, to + 1), total: rows.length};},
    readNames: async batch => {names.push(batch); return [];}, ...options,
  }};
}

test('the complete catalog reads beyond 1000 rows and batches every public-name lookup', async () => {
  const rows = Array.from({length: 1237}, (_, index) => game(`game-${String(index).padStart(4, '0')}`));
  const read = reader(rows);
  const published = await collectPublishedSoftware(read.options);
  assert.equal(published.length, 1237);
  assert.deepEqual(read.pages, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(read.names.length, 13);
  assert.deepEqual(read.names.flat(), rows.map(row => row.slug));
  const catalog = softwareCatalog(published, timestamp);
  assert.equal(catalog.count, 1238);
  assert.equal(new Set(catalog.software.map(row => row.url)).size, 1238);
  const html = renderSoftwareIndex(catalog);
  assert.equal((html.match(/<article>/g) || []).length, 1238);
  const routes = gameRoutes(published);
  for (const item of catalog.software) assert.ok(routes.has(new URL(item.url).pathname.replace(/^\/|\/$/g, '')));
});

test('exact full pages finish without requiring a speculative page and zero rows remain honest', async () => {
  for (const size of [0, 500, 1000]) {
    const read = reader(Array.from({length: size}, (_, i) => game(`game-${i}`)));
    assert.equal((await collectPublishedSoftware(read.options)).length, size);
    assert.equal(read.pages.length, Math.max(1, size / 500));
  }
});

test('truncation, a changing count, duplicates, missing count and transport errors fail closed', async () => {
  await assert.rejects(collectPublishedSoftware(reader([], {readPage: async () => ({rows: [game('one')], total: 600})}).options), /truncated catalog/);
  await assert.rejects(collectPublishedSoftware(reader([], {pageSize: 1, readPage: async from => ({rows: [game(`game-${from}`)], total: from ? 3 : 2})}).options), /changed during pagination/);
  await assert.rejects(collectPublishedSoftware(reader([game('same'), game('same')]).options), /duplicate game/);
  await assert.rejects(collectPublishedSoftware(reader([], {readPage: async () => ({rows: []})}).options), /invalid catalog page/);
  await assert.rejects(collectPublishedSoftware(reader([], {readPage: async () => {throw new Error('network failed');}}).options), /network failed/);
  await assert.rejects(collectPublishedSoftware(reader([], {pageSize: 0}).options), /invalid catalog page size/);
});

test('drafts, deletion-authorized rows and missing identity/title/platform metadata cannot enter the index', async () => {
  for (const row of [game('draft', {status: 'draft'}), game('gone', {media_delete_authorized: true}),
    game(undefined), game('untitled', {name: ''}), game('unknown', {supported_platforms: []}), game('unknown', {persistent: null})]) {
    await assert.rejects(collectPublishedSoftware(reader([row]).options), /Software index incomplete/);
  }
});

test('the production query explicitly requests exact counts and only public non-deleted rows', async () => {
  const calls = [];
  const chain = {
    select(...args) {calls.push(['select', ...args]); return this;},
    eq(...args) {calls.push(['eq', ...args]); return this;},
    order(...args) {calls.push(['order', ...args]); return this;},
    range(...args) {calls.push(['range', ...args]); return this;},
    abortSignal() {return this;}, retry() {return this;},
    then(resolve) {return Promise.resolve({data: [game('actual')], error: null, count: 1}).then(resolve);},
  };
  const result = await readPublishedSoftware({from: table => {assert.equal(table, 'games'); return chain;},
    rpc: (name, params) => {assert.equal(name, 'game_public_names'); assert.deepEqual(params, {p_game_slugs: ['actual']}); return {...chain, then: resolve => Promise.resolve({data: [], error: null}).then(resolve)};}});
  assert.equal(result.length, 1);
  assert.ok(calls.some(call => call[0] === 'select' && call[2].count === 'exact'));
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'status', 'published'])));
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'media_delete_authorized', false])));
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['order', 'slug'])));
});

test('names and slugs cannot escape game paths or introduce schemes, traversal or queries', () => {
  for (const slug of [null, undefined, '', '../private', 'two/parts', 'foo?x=1', 'foo#x', '%2fprivate', 'https://bad.test', 'a'.repeat(121)]) {
    assert.throws(() => universalGameUrl(slug), /invalid native game identity/);
  }
  assert.equal(universalGameUrl('mcp-Ab_123'), 'https://slop.game/play/mcp-Ab_123/');
});

test('permanent index links use stable identities while existing canonical root aliases stay unchanged', async () => {
  const read = reader([game('mcp-original'), game('home')], {readNames: async () => [{game_slug: 'mcp-original', name: 'night-drift'}]});
  const published = await collectPublishedSoftware(read.options);
  const routes = gameRoutes(published);
  assert.equal(routes.get('night-drift').canonical, 'https://slop.game/night-drift');
  assert.equal(routes.get('mcp-original').canonical, 'https://slop.game/night-drift');
  assert.equal(routes.get('play/mcp-original').canonical, 'https://slop.game/night-drift');
  assert.equal(routes.get('g/mcp-original').canonical, 'https://slop.game/night-drift');
  assert.equal(routes.get('play/home').canonical, 'https://slop.game/g/home');
  assert.equal(softwareCatalog(published, timestamp).software.find(row => row.slug === 'mcp-original').url, 'https://slop.game/play/mcp-original/');
});

test('every index link fits the already reviewed Slop AASA paths without widening the manifest', () => {
  const association = JSON.parse(readFileSync(new URL('../public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
  const app = association.applinks.details.find(detail => detail.appID === '6S8Z64V9JP.game.slop.slop');
  assert.ok(app.paths.includes('/play/*'));
  for (const row of softwareCatalog([game('mcp-123')], timestamp).software) {
    const url = new URL(row.url);
    assert.equal(url.origin, 'https://slop.game');
    assert.match(url.pathname, /^\/play\/[A-Za-z0-9][A-Za-z0-9_-]{0,119}\/$/);
    assert.equal(url.search, ''); assert.equal(url.hash, '');
  }
});

test('metadata is escaped in visible HTML; blank descriptions stay explicitly unavailable', () => {
  const hostile = game('real-game', {name: '<script>alert("x")</script>', description: '<img src=x onerror=alert(1)> & \'title\'', category: '<b>not markup</b>'});
  const catalog = softwareCatalog([hostile, game('empty', {description: '  '})], timestamp);
  const html = renderSoftwareIndex(catalog);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &#39;title&#39;'));
  assert.ok(html.includes('&lt;b&gt;not markup&lt;/b&gt;'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('No description has been provided.'));
  assert.equal(catalog.software.find(row => row.slug === 'empty').description, null);
  assert.equal(catalog.software.find(row => row.slug === 'real-game').name, hostile.name);
});

test('same-title games remain separate and a World uses its actual persistent metadata', () => {
  const catalog = softwareCatalog([game('world-one', {name: 'Upfall', persistent: true}), game('arcade-two', {name: 'Upfall'})], timestamp);
  assert.equal(catalog.software.filter(row => row.name === 'Upfall').length, 2);
  assert.equal(catalog.software.find(row => row.slug === 'world-one').type, 'World');
  assert.equal(catalog.software.find(row => row.slug === 'arcade-two').type, 'Arcade');
});

test('malformed name mappings and route collisions stop the build instead of dropping an entry', async () => {
  for (const names of [[{game_slug: 'not-requested', name: 'valid'}], [{game_slug: 'one', name: undefined}], [{game_slug: 'one', name: '../bad'}]]) {
    await assert.rejects(collectPublishedSoftware(reader([game('one')], {readNames: async () => names}).options), /invalid public-name/);
  }
  assert.throws(() => gameRoutes([game('one', {public_name: 'same'}), game('two', {public_name: 'same'})]), /route collision/);
  assert.throws(() => softwareCatalog([game('grun')], timestamp), /platform\/catalog identity collision/);
});

test('reviewed platform Run Infinite is included without inventing a browser bundle or enabling multiplayer', () => {
  const catalog = softwareCatalog([], timestamp);
  assert.deepEqual(catalog.software.map(row => row.slug), ['grun']);
  const item = catalog.software[0];
  assert.equal(item.url, 'https://slop.game/play/grun/');
  assert.equal(item.web_url, null);
  assert.deepEqual(item.platforms, ['mobile']);
  const html = renderPlatformGame(PLATFORM_SOFTWARE[0]);
  assert.ok(html.includes('Rotate around a square tube in space, jump the gaps, outrun the shrinking ribbon.'));
  assert.ok(html.includes('href="/#/download"'));
  assert.ok(!html.includes('iframe')); assert.ok(!html.includes('air-hockey'));
});

test('the static index is discoverable without a login or JavaScript pagination', () => {
  const html = renderSoftwareIndex(softwareCatalog([game('actual')], timestamp));
  assert.ok(html.includes('href="/games/catalog.json"'));
  assert.ok(!html.includes('<script'));
  for (const source of ['../src/components/BrandChrome.jsx', '../public/support.html', '../public/support/index.html']) {
    assert.ok(readFileSync(new URL(source, import.meta.url), 'utf8').includes('href="/games/"'));
  }
});
