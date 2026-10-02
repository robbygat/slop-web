import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const read = (path, encoding = 'utf8') => readFile(new URL(path, import.meta.url), encoding);

test('0.6.1 package, lockfile, CLI handshake and current setup instructions agree', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  const lock = JSON.parse(await read('../package-lock.json'));
  const cli = await read('../cli.mjs');
  const readme = await read('../README.md');
  const setup = await read('../../src/components/McpSetup.jsx');
  assert.equal(pkg.version, '0.6.1');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(cli, /new McpServer\(\{ name: "slop", version: "0\.6\.1" \}\)/);
  assert.deepEqual([...new Set([...readme.matchAll(/slop-game-mcp-(\d+\.\d+\.\d+)\.tgz/g)].map(match => match[1]))], [pkg.version]);
  assert.match(setup, /https:\/\/slop\.game\/downloads\/slop-game-mcp-0\.6\.1\.tgz/);
});

test('published 0.6.0 archive is preserved byte for byte while the client advances', async () => {
  const previous = await read('../../public/downloads/slop-game-mcp-0.6.0.tgz', null);
  assert.equal(previous.length, 175049);
  assert.equal(createHash('sha256').update(previous).digest('hex'),
    '3d9ec7ecb83258434f5f85065f572bdfef6ea15b6fecf86c4b172fa641971b83');
});
