// Release archive test: dist/<name>-<version>.tgz (npm run pack) holds exactly what PLUGINS.md lists, with
// safe paths, and the unpacked plugin works with no node_modules: the MCP smoke test runs against the extracted
// server. `node tests/pack-test.mjs`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'plugin.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.version, pkg.version, 'plugin.json and package.json agree on the version');
const archive = path.join(root, 'dist', `${manifest.name}-${manifest.version}.tgz`);
assert.ok(existsSync(archive), `${archive} is missing: run npm run pack`);

// the listing: type, then the path as stored
const listing = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }).trim().split('\n').map(line => ({ type: line[0], path: line.split(/\s+/).slice(5).join(' ') }));
const paths = listing.map(e => e.path);
const skills = readdirSync(path.join(root, 'skills'), { recursive: true }).filter(f => lstatSync(path.join(root, 'skills', f)).isFile()).map(f => `skills/${f}`);
assert.deepEqual([...paths].sort(), ['LICENSE', 'README.md', 'mcp/dist/server.js', 'plugin.json', 'ui/dist/index.html', ...skills].sort(), 'exactly the files PLUGINS.md lists');
assert.ok(skills.length > 0);
for (const e of listing) {
  assert.equal(e.type, '-', `${e.path} must be a regular file (no links, no folders)`);
  assert.ok(!e.path.startsWith('/') && !e.path.startsWith('./'), `${e.path}: relative path with no leading ./`);
  assert.ok(e.path.split('/').every(part => part && part !== '..' && part !== '.' && !part.startsWith('.') && part !== 'node_modules'), `${e.path}: no .., dot files or node_modules`);
}

// the archive is the file whose checksum pack printed
const sha = createHash('sha256').update(readFileSync(archive)).digest('hex');
assert.equal(readFileSync(archive + '.sha256', 'utf8').split(' ')[0], sha);

// unpack to a temp dir (outside this repository, so no node_modules above it) and run the smoke test there
const dir = mkdtempSync(path.join(tmpdir(), 'zensudoku-pack-'));
try {
  execFileSync('tar', ['-xzf', archive, '-C', dir]);
  assert.ok(!existsSync(path.join(dir, 'node_modules')));
  const smoke = spawnSync(process.execPath, [path.join(root, 'tests/mcp-smoke.mjs'), dir], { encoding: 'utf8' });
  assert.equal(smoke.status, 0, `smoke test failed against the unpacked archive:\n${smoke.stdout}\n${smoke.stderr}`);
  assert.match(smoke.stdout, /mcp smoke ok: 9 tools/);
  console.log(`pack ok: ${path.basename(archive)} sha256 ${sha}, ${paths.length} files; ${smoke.stdout.trim()} (from the unpacked archive)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
