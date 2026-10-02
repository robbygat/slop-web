import {createHash, randomUUID} from 'node:crypto';
import {constants, createReadStream, createWriteStream} from 'node:fs';
import {lstat, mkdir, readFile, rename, unlink} from 'node:fs/promises';
import {isAbsolute, join, resolve} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';

// The APK is a deployment artifact, never a Git blob. Every source, including
// restored Actions caches, must prove the reviewed digest before publication.
export function validateAndroidMetadata(release, manifest) {
  if (!release || !manifest || !/^\d+\.\d+\.\d+$/.test(release.version)
      || !Number.isSafeInteger(release.build) || release.build < 1
      || release.package !== 'game.slop.api'
      || !/^[a-f0-9]{64}$/.test(release.sha256)) {
    throw new Error('Invalid Android release identity');
  }
  const file = `Slop-${release.version}-build-${release.build}-universal.apk`;
  const url = `https://slop.game/downloads/${file}`;
  const sourceUrl = `https://github.com/robbygat/slop-web/releases/download/android-${release.version}-build-${release.build}/${file}`;
  if (release.file !== file || release.url !== url
      || manifest.sourceUrl !== sourceUrl || manifest.versionCode !== release.build
      || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1
      || manifest.bytes >= 1_000_000_000) {
    throw new Error('Android artifact path, source, build or size does not match');
  }
  for (const field of ['file', 'url', 'version', 'package', 'sha256']) {
    if (manifest[field] !== release[field]) throw new Error(`Android metadata mismatch: ${field}`);
  }
  if (release.bytes !== undefined && release.bytes !== manifest.bytes) {
    throw new Error('Android metadata mismatch: bytes');
  }
  return {file, url, sourceUrl, bytes: manifest.bytes, sha256: release.sha256};
}

async function statIfPresent(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function digestMeter(expected) {
  let bytes = 0;
  const hash = createHash('sha256');
  return {
    stream: new Transform({transform(chunk, _encoding, next) {
      bytes += chunk.length;
      if (bytes > expected.bytes) return next(new Error('APK exceeds the reviewed byte count'));
      hash.update(chunk);
      next(null, chunk);
    }}),
    finish() {
      if (bytes !== expected.bytes) throw new Error('APK is truncated or has the wrong byte count');
      if (hash.digest('hex') !== expected.sha256) throw new Error('APK SHA-256 mismatch');
    },
  };
}

async function regularFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('APK source must be a regular file');
  return stat;
}

function openSource(path) {
  return createReadStream(path, {flags: constants.O_RDONLY | constants.O_NOFOLLOW});
}

async function verifyFile(path, expected) {
  const stat = await regularFile(path);
  if (stat.size !== expected.bytes) throw new Error('APK file has the wrong byte count');
  const meter = digestMeter(expected);
  // Consume without retaining the 185 MB artifact in memory.
  await pipeline(openSource(path), meter.stream, new Transform({transform(_chunk, _encoding, next) { next(); }}));
  meter.finish();
}

async function writeVerified(destination, source, expected) {
  const previous = await statIfPresent(destination);
  if (previous) {
    await verifyFile(destination, expected);
    return;
  }
  const temporary = `${destination}.${randomUUID()}.partial`;
  try {
    const meter = digestMeter(expected);
    await pipeline(await source(), meter.stream, createWriteStream(temporary, {flags: 'wx', mode: 0o644}));
    meter.finish();
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(cleanup => { if (cleanup.code !== 'ENOENT') throw cleanup; });
    throw error;
  }
}

async function checkedCacheDirectory(path) {
  if (!isAbsolute(path) || resolve(path) === '/') throw new Error('Cache directory must be an absolute dedicated path');
  await mkdir(path, {recursive: true, mode: 0o700});
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Cache directory must be an owned, non-symlink directory');
  }
}

export async function stageAndroidDownload({release, manifest, outDir = 'dist', cacheDir, sourceFile,
  fetcher = fetch, timeoutMs = 180_000}) {
  const expected = validateAndroidMetadata(release, manifest);
  const output = resolve(outDir);
  const outputStat = await lstat(output);
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw new Error('Build output must be an existing directory');
  const downloads = join(output, 'downloads');
  await mkdir(downloads, {recursive: true});
  const downloadsStat = await lstat(downloads);
  if (!downloadsStat.isDirectory() || downloadsStat.isSymbolicLink()) throw new Error('Downloads must be a non-symlink directory');

  let cacheFile;
  if (cacheDir) {
    await checkedCacheDirectory(cacheDir);
    cacheFile = join(cacheDir, `${expected.sha256}.apk`);
    if (await statIfPresent(cacheFile)) await verifyFile(cacheFile, expected);
  }
  if (sourceFile) await verifyFile(sourceFile, expected);
  const source = async () => {
    if (sourceFile) return openSource(sourceFile);
    if (cacheFile && await statIfPresent(cacheFile)) return openSource(cacheFile);
    let response;
    try {
      response = await fetcher(expected.sourceUrl, {signal: AbortSignal.timeout(timeoutMs)});
    } catch {
      // Do not leak signed redirect URLs from fetch exceptions into CI logs.
      throw new Error('APK source request failed');
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new Error(`APK source returned HTTP ${response.status}`);
    }
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) !== expected.bytes) {
      await response.body.cancel();
      throw new Error('APK source Content-Length does not match reviewed bytes');
    }
    return Readable.from((async function* () {
      try { for await (const chunk of response.body) yield chunk; }
      catch { throw new Error('APK source stream failed'); }
    })());
  };
  // Cache is content-addressed and verified on every reuse, never a fallback
  // to another build. Failed staging leaves the currently deployed site alone.
  if (cacheFile) await writeVerified(cacheFile, source, expected);
  const destination = join(downloads, expected.file);
  await writeVerified(destination, cacheFile ? async () => openSource(cacheFile) : source, expected);
  return {...expected, destination};
}

async function main() {
  const options = {};
  const names = new Map([['--cache-dir', 'cacheDir'], ['--source-file', 'sourceFile'], ['--out-dir', 'outDir'], ['--metadata-dir', 'metadataDir']]);
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = names.get(process.argv[i]);
    if (!key || !process.argv[i + 1] || options[key]) throw new Error('Use --cache-dir, --source-file, --out-dir or --metadata-dir with one value each');
    options[key] = process.argv[i + 1];
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const metadata = options.metadataDir ? resolve(options.metadataDir) : join(root, 'public/downloads');
  const [release, manifest] = await Promise.all(['android-release.json', 'android-build-manifest.json'].map(
    async file => JSON.parse(await readFile(join(metadata, file), 'utf8'))));
  const result = await stageAndroidDownload({release, manifest, ...options});
  console.log(`Verified first-party APK: ${result.file} (${result.bytes} bytes, SHA-256 ${result.sha256})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`APK staging failed: ${error.message}`); process.exitCode = 1; });
}
