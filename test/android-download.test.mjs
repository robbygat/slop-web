import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {latestAndroidRelease} from '../src/lib/android-release.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const release = JSON.parse(await read('public/downloads/android-release.json'));
const manifest = JSON.parse(await read('public/downloads/android-build-manifest.json'));

test('shared Android release metadata names the verified 2077 APK', () => {
  assert.equal(release.build, 2077);
  assert.equal(release.package, 'game.slop.api');
  assert.equal(release.version, '3.7.7');
  assert.equal(release.file, 'Slop-3.7.7-build-2077-universal.apk');
  assert.equal(release.url, `https://slop.game/downloads/${release.file}`);
  assert.equal(manifest.sourceUrl, `https://github.com/robbygat/slop-web/releases/download/android-3.7.7-build-2077/${release.file}`);
  assert.equal(release.sha256, 'a041ed8f6e73b95eda0ea70f71edd2177fd6cf96452161f961fa749fd3a19e7b');
});

test('download page and artifact manifest agree without changing ad gates', () => {
  for (const field of ['url', 'file', 'version', 'package', 'sha256']) {
    assert.equal(manifest[field], release[field]);
  }
  assert.equal(manifest.versionCode, release.build);
  assert.equal(manifest.bytes, 184841937);
  assert.equal(manifest.adsEnabled, false);
  assert.equal(manifest.AD_ID_permission, false);
  assert.equal(manifest.signingCertificateSha256, '4866dc903fe041f8e0bee3c240ae1340ec4ebcfdd5a4e34019f4fc8eb597b8ab');
});

test('hero and download page use the shared release rather than stale APK constants', async () => {
  const [hero, links, download] = await Promise.all([
    read('src/components/Hero.jsx'), read('src/components/DownloadLinks.jsx'), read('src/pages/Download.jsx'),
  ]);
  assert.match(hero, /<DownloadLinks compact\s*\/?>/);
  assert.match(links, /useAndroidRelease/);
  assert.match(links, /href=\{androidRelease\.url\}/);
  assert.match(download, /useAndroidRelease/);
  assert.match(download, /href=\{release\.url\}/);
  assert.match(download, /Build \{release\.build\}/);
  assert.match(links, /download=\{androidRelease\.file\}/);
  assert.doesNotMatch(links, /href=.*github\.com/);
});

test('freshness check bypasses browser cache and accepts a newer first-party release', async () => {
  const newer={...release,build:2078,file:'Slop-3.7.7-build-2078-universal.apk',url:'https://slop.game/downloads/Slop-3.7.7-build-2078-universal.apk'};
  const result=await latestAndroidRelease(release,async(url,options)=>{
    assert.equal(url,'/downloads/android-release.json');
    assert.equal(options.cache,'no-store');
    return {ok:true,json:async()=>newer};
  });
  assert.equal(result,newer);
});

test('failed, stale or foreign release metadata never replaces the bundled verified download', async () => {
  const bad=[null,{}, {...release,build:2074}, {...release,url:'https://github.com/other/file.apk'}, {...release,package:'other'}, {...release,sha256:'wrong'}, {...release,file:'../old.apk'}];
  for(const value of bad)assert.equal(await latestAndroidRelease(release,async()=>({ok:true,json:async()=>value})),release);
  assert.equal(await latestAndroidRelease(release,async()=>{throw Error('offline');}),release);
  assert.equal(await latestAndroidRelease(release,async()=>({ok:false})),release);
  assert.equal(await latestAndroidRelease(release,async()=>({ok:true,json:async()=>{throw Error('bad json');}})),release);
});

test('Pages verifies and stages the APK only after the site build and before upload', async () => {
  const flow=await read('.github/workflows/pages.yml');
  assert.ok(flow.indexOf('run: npm run build')<flow.indexOf('node scripts/stage-android-download.mjs'));
  assert.ok(flow.indexOf('node scripts/stage-android-download.mjs')<flow.indexOf('actions/upload-pages-artifact@'));
  assert.match(flow,/actions\/cache@[a-f0-9]{40}/);
  assert.match(flow,/hashFiles\('public\/downloads\/android-build-manifest\.json'\)/);
  assert.match(flow,/--metadata-dir public\/downloads\/archive\/2076/);
});

test('the previous first-party APK remains pinned for staging after upgrade', async () => {
  const archived = JSON.parse(await read('public/downloads/archive/2076/android-release.json'));
  const archiveManifest = JSON.parse(await read('public/downloads/archive/2076/android-build-manifest.json'));
  const {validateAndroidMetadata} = await import('../scripts/stage-android-download.mjs');
  const validated = validateAndroidMetadata(archived, archiveManifest);
  assert.equal(validated.file, 'Slop-3.7.7-build-2076-universal.apk');
  assert.equal(validated.sha256, '609161105b0c063e66dfce936c75a5c74058a967d32c77f4ab0815cd7b07bbab');
  assert.equal(validated.bytes, 184841937);
});
