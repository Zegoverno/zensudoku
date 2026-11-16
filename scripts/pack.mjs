// Writes dist/<name>-<version>.tgz: the plugin as zenbot installs it (docs: PLUGINS.md, "Releasing").
//   plugin.json, mcp/dist/server.js, ui/dist/index.html, skills/, README.md, LICENSE
// Run it after the build (`npm run pack` does both). Paths are relative with no "./", the archive has no links,
// dot files or node_modules, and the same inputs give the same bytes. Prints the sha256 and writes it next to the archive.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('plugin.json')), pkg = JSON.parse(read('package.json'));
if (manifest.version !== pkg.version) throw new Error(`plugin.json version ${manifest.version} != package.json version ${pkg.version}`);
if (manifest.name !== pkg.name) throw new Error(`plugin.json name ${manifest.name} != package.json name ${pkg.name}`);

const files = ['plugin.json', 'mcp/dist/server.js', 'ui/dist/index.html', 'README.md', 'LICENSE'];
function addTree(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.')) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) addTree(rel); else files.push(rel);
  }
}
addTree(manifest.skills.replace(/\/$/, ''));

for (const f of files) {
  let st;
  try { st = lstatSync(path.join(root, f)); } catch { throw new Error(`${f} is missing: run npm run build first`); }
  if (!st.isFile()) throw new Error(`${f} must be a regular file (no links, no folders)`);
}

const out = path.join(root, 'dist');
mkdirSync(out, { recursive: true });
const tar = spawnSync('tar', ['--create', '--format=ustar', '--owner=0', '--group=0', '--numeric-owner', '--mtime=@315532800', '--no-recursion', '--file=-', '-C', root, ...files],
  { maxBuffer: 256 * 1024 * 1024 });
if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
const archive = gzipSync(tar.stdout, { level: 9 });
const name = `${manifest.name}-${manifest.version}.tgz`;
writeFileSync(path.join(out, name), archive);
const sha256 = createHash('sha256').update(archive).digest('hex');
writeFileSync(path.join(out, `${name}.sha256`), `${sha256}  ${name}\n`);
console.log(`dist/${name}  ${archive.length} bytes, ${files.length} files\nsha256 ${sha256}`);
