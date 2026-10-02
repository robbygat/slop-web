import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageAndroidDownload, validateAndroidMetadata} from '../scripts/stage-android-download.mjs';

const bytes = Buffer.from('verified-APK-fixture-2076');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const file = 'Slop-3.7.7-build-2076-universal.apk';
const release = {version: '3.7.7', build: 2076, package: 'game.slop.api', file,
  url: `https://slop.game/downloads/${file}`, sha256};
const manifest = {...release, versionCode: 2076, bytes: bytes.length,
  sourceUrl: `https://github.com/robbygat/slop-web/releases/download/android-3.7.7-build-2076/${file}`};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'slop-apk-stage-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const outDir = join(root, 'dist');
  await mkdir(outDir);
  const cacheDir = join(root, 'cache');
  return {root, outDir, cacheDir, release, manifest};
}

test('metadata requires the exact first-party filename and immutable reviewed source', () => {
  assert.equal(validateAndroidMetadata(release, manifest).bytes, bytes.length);
  const invalid = [
    [{...release, url: manifest.sourceUrl}, manifest],
    [release, {...manifest, sourceUrl: manifest.sourceUrl.replace('2076/', '2075/')}],
    [release, {...manifest, sourceUrl: `${manifest.sourceUrl}?latest=true`}],
    [release, {...manifest, sourceUrl: manifest.sourceUrl.replace('github.com', 'attacker.example')}],
    [release, {...manifest, versionCode: 2075}],
    [release, {...manifest, sha256: 'a'.repeat(64)}],
    [release, {...manifest, file: '../bad.apk'}],
    [release, {...manifest, package: 'wrong.package'}],
    [release, {...manifest, bytes: 0}],
    [release, {...manifest, bytes: 1_000_000_000}],
    [{...release, bytes: 1}, manifest],
  ];
  for (const pair of invalid) assert.throws(() => validateAndroidMetadata(...pair));
});

test('a verified streamed download stages exact bytes and reuses only a reverified cache', async t => {
  const f = await fixture(t);
  let requests = 0;
  const fetcher = async url => {
    requests++;
    assert.equal(url, manifest.sourceUrl);
    return new Response(bytes, {headers: {'Content-Length': String(bytes.length)}});
  };
  const result = await stageAndroidDownload({...f, fetcher});
  assert.deepEqual(await readFile(result.destination), bytes);
  assert.deepEqual(await readFile(join(f.cacheDir, `${sha256}.apk`)), bytes);
  const otherOutput = join(f.root, 'second-dist');
  await mkdir(otherOutput);
  await stageAndroidDownload({...f, outDir: otherOutput, fetcher});
  assert.equal(requests, 1);
  assert.deepEqual(await readdir(f.cacheDir), [`${sha256}.apk`]);
});

test('local verified source is unchanged, older APK is preserved and no network is used', async t => {
  const f = await fixture(t);
  const sourceFile = join(f.root, 'original.apk');
  await writeFile(sourceFile, bytes);
  await mkdir(join(f.outDir, 'downloads'));
  await writeFile(join(f.outDir, 'downloads', 'old-2074.apk'), 'preserve');
  const result = await stageAndroidDownload({...f, sourceFile, fetcher: () => { throw Error('No network expected'); }});
  assert.deepEqual(await readFile(result.destination), bytes);
  assert.deepEqual(await readFile(sourceFile), bytes);
  assert.equal(await readFile(join(f.outDir, 'downloads', 'old-2074.apk'), 'utf8'), 'preserve');
});

test('truncated, oversized, altered, failed and false-length sources never stage an APK', async t => {
  const cases = [
    () => new Response(bytes.subarray(1)),
    () => new Response(Buffer.concat([bytes, Buffer.from('extra')])),
    () => new Response(Buffer.alloc(bytes.length, 0)),
    () => new Response('not found', {status: 404}),
    () => new Response(bytes, {headers: {'Content-Length': '1'}}),
    () => { throw new Error('https://signed.example/secret'); },
    () => new Response(new ReadableStream({start(controller) {
      controller.error(new Error('https://signed.example/secret'));
    }})),
  ];
  for (const fetcher of cases) {
    const f = await fixture(t);
    await assert.rejects(stageAndroidDownload({...f, fetcher}), error => {
      assert.doesNotMatch(error.message, /signed.example|secret/);
      return true;
    });
    assert.deepEqual(await readdir(join(f.outDir, 'downloads')), []);
    assert.deepEqual(await readdir(f.cacheDir), []);
  }
});

test('same-size corrupt cache fails closed without fetching or publishing and is preserved', async t => {
  const f = await fixture(t);
  await mkdir(f.cacheDir);
  const corrupt = Buffer.alloc(bytes.length, 9);
  const cacheFile = join(f.cacheDir, `${sha256}.apk`);
  await writeFile(cacheFile, corrupt);
  let fetched = false;
  await assert.rejects(stageAndroidDownload({...f, fetcher: () => { fetched = true; return new Response(bytes); }}), /SHA-256/);
  assert.equal(fetched, false);
  assert.deepEqual(await readFile(cacheFile), corrupt);
  assert.deepEqual(await readdir(join(f.outDir, 'downloads')), []);
});

test('wrong local source and symlink cache are rejected, without modifying either', async t => {
  const f = await fixture(t);
  const sourceFile = join(f.root, 'wrong.apk');
  await writeFile(sourceFile, 'wrong');
  await assert.rejects(stageAndroidDownload({...f, sourceFile}), /byte count/);
  assert.equal(await readFile(sourceFile, 'utf8'), 'wrong');
  const target = join(f.root, 'cache-target');
  await mkdir(target);
  const link = join(f.root, 'cache-link');
  await symlink(target, link);
  await assert.rejects(stageAndroidDownload({...f, cacheDir: link}), /non-symlink/);
  await assert.rejects(stageAndroidDownload({...f, cacheDir: 'relative-cache'}), /absolute/);
  assert.deepEqual(await readdir(target), []);
});

test('a corrupt staged destination is never silently overwritten', async t => {
  const f = await fixture(t);
  const sourceFile = join(f.root, 'original.apk');
  await writeFile(sourceFile, bytes);
  await mkdir(join(f.outDir, 'downloads'));
  const destination = join(f.outDir, 'downloads', file);
  await writeFile(destination, 'bad-existing-file');
  await assert.rejects(stageAndroidDownload({...f, sourceFile}), /byte count/);
  assert.equal(await readFile(destination, 'utf8'), 'bad-existing-file');
  assert.deepEqual(await readFile(sourceFile), bytes);
});
