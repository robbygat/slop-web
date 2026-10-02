import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const release = JSON.parse(await read('public/downloads/android-release.json'));
const manifest = JSON.parse(await read('public/downloads/android-build-manifest.json'));

test('shared Android release metadata names the verified 2075 APK', () => {
  assert.equal(release.build, 2075);
  assert.equal(release.package, 'game.slop.api');
  assert.equal(release.version, '3.7.7');
  assert.equal(release.file, 'Slop-3.7.7-build-2075-universal.apk');
  assert.equal(release.url, `https://github.com/robbygat/slop-web/releases/download/android-3.7.7-build-2075/${release.file}`);
  assert.equal(release.sha256, 'f514166f5297589d8b216fff233ebde5e5c061d556dbc0034fd806d311ae7db4');
});

test('download page and artifact manifest agree without changing ad gates', () => {
  for (const field of ['url', 'file', 'version', 'package', 'sha256']) {
    assert.equal(manifest[field], release[field]);
  }
  assert.equal(manifest.versionCode, release.build);
  assert.equal(manifest.bytes, 184841277);
  assert.equal(manifest.adsEnabled, false);
  assert.equal(manifest.AD_ID_permission, false);
  assert.equal(manifest.signingCertificateSha256, '4866dc903fe041f8e0bee3c240ae1340ec4ebcfdd5a4e34019f4fc8eb597b8ab');
});

test('hero and download page use the shared release rather than stale APK constants', async () => {
  const [hero, links, download] = await Promise.all([
    read('src/components/Hero.jsx'), read('src/components/DownloadLinks.jsx'), read('src/pages/Download.jsx'),
  ]);
  assert.match(hero, /<DownloadLinks compact\s*\/?>/);
  assert.match(links, /import androidRelease from ['"]\.\.\/\.\.\/public\/downloads\/android-release\.json['"]/);
  assert.match(links, /href=\{androidRelease\.url\}/);
  assert.match(download, /fetch\(['"]\/downloads\/android-release\.json['"]\)/);
  assert.match(download, /href=\{release\.data\.url\}/);
});
