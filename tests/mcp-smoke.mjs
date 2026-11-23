// MCP smoke test: start the built server (mcp/dist/server.js) over stdio with the SDK client, list
// tools and resources, read the ui:// resource, and call every tool once; then again with a data folder
// (ZEN_PLUGIN_DATA) holding a small hand-made SudokuPad library, as zenbot gives one.
// `node tests/mcp-smoke.mjs [plugin-folder]`: the folder defaults to this repository; tests/pack-test.mjs
// passes the unpacked release archive, so the same checks run against exactly what ships.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import LZ from 'lz-string';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = new URL('..', import.meta.url).pathname;
const root = process.argv[2] ? resolve(process.argv[2]) + '/' : repo;
const manifest = JSON.parse(readFileSync(root + 'plugin.json', 'utf8'));
const catalog = JSON.parse(readFileSync(repo + 'core/catalog.json', 'utf8')).puzzles[0];

const client = new Client({ name: 'smoke', version: '0' });
await client.connect(new StdioClientTransport({
  command: manifest.server.command, args: manifest.server.args, cwd: root,
  env: { PATH: process.env.PATH ?? '' },     // what a sandboxed host gives: no ZEN_PLUGIN_FILES
}));

const text = r => r.content.map(c => c.text).join('\n');
try {
  // tools
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  assert.deepEqual(names, ['zensudoku_check', 'zensudoku_hint', 'zensudoku_library', 'zensudoku_new', 'zensudoku_open', 'zensudoku_puzzle', 'zensudoku_report', 'zensudoku_state']);
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  assert.equal(byName.zensudoku_new._meta.ui.resourceUri, 'ui://zensudoku/app');
  assert.deepEqual(byName.zensudoku_report._meta.ui.visibility, ['app']);
  assert.deepEqual(byName.zensudoku_puzzle._meta.ui.visibility, ['app']);
  assert.equal(byName.zensudoku_open._meta.ui.resourceUri, 'ui://zensudoku/app');
  assert.equal(byName.zensudoku_library._meta?.ui?.visibility, undefined, 'the app lists the library too');
  assert.equal(manifest.contributes.commands[0].tool, 'zensudoku_new');
  assert.ok(names.includes(manifest.contributes.commands[0].tool));
  assert.deepEqual(manifest.kernel, []);
  assert.equal(manifest.name, 'zensudoku');
  assert.deepEqual(manifest.contributes.games.map(g => [g.id, g.ui]), [['sudoku', 'ui://zensudoku/app']]);
  assert.ok(names.every(n => n.startsWith('zensudoku_')));

  // resources
  assert.equal(manifest.contributes.views, undefined);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map(r => r.uri), ['ui://zensudoku/app']);
  assert.equal(resources[0].mimeType, 'text/html;profile=mcp-app');
  const ui = await client.readResource({ uri: 'ui://zensudoku/app' });
  assert.equal(ui.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(ui.contents[0].text, /<html[\s\S]*<\/html>\s*$/i);
  assert.ok(ui.contents[0].text.length > 50_000, 'the UI is one self-contained file');
  assert.doesNotMatch(ui.contents[0].text, /<script[^>]+src=|<link[^>]+href=/i, 'no external files');

  // zensudoku_new: the example
  const opened = await client.callTool({ name: 'zensudoku_new', arguments: {} });
  assert.ok(!opened.isError);
  assert.equal(opened.structuredContent.puzzleId, 'example-classic');
  assert.equal(opened.structuredContent.givens, catalog.givens.replace(/0/g, '.'));
  assert.match(text(opened), /Example — classic/);

  // zensudoku_state
  const state = await client.callTool({ name: 'zensudoku_state', arguments: {} });
  assert.equal(state.structuredContent.filled, catalog.givens.replace(/0/g, '').length);
  assert.deepEqual(state.structuredContent.conflicts, []);
  assert.equal(state.structuredContent.solved, false);
  assert.match(text(state), /------\+-------\+------/);

  // zensudoku_hint: one step, not the solution
  const hint = await client.callTool({ name: 'zensudoku_hint', arguments: {} });
  assert.match(hint.structuredContent.kind, /^(naked|hidden)$/);
  assert.match(hint.structuredContent.cell, /^R\dC\d$/);
  assert.equal(typeof hint.structuredContent.value, 'number');
  assert.ok(text(hint).length < 400);
  const solution = catalog.solution;
  const empties = catalog.givens.replace(/0/g, '').length;
  assert.ok(!text(hint).includes(solution), 'never the solution');
  assert.ok(empties < 81);

  // the app reports a board (as the UI does); state and check see it
  const cells = catalog.givens.split('').map(Number);
  const firstEmpty = cells.indexOf(0), wrong = (Number(catalog.solution[firstEmpty]) % 9) + 1;
  let report = await client.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'example-classic', cells: cells.map((n, i) => (i === firstEmpty ? wrong : n || '.')).join(''), selected: firstEmpty } });
  assert.ok(!report.isError, text(report));
  const check = await client.callTool({ name: 'zensudoku_check', arguments: {} });
  assert.equal(check.structuredContent.solved, false);
  assert.ok(check.structuredContent.conflicts.length > 0 || check.structuredContent.wrongEntries === 1);
  // refuses a board that changes a given, and a wrong shape
  const given = cells.findIndex(n => n);
  const tamper = cells.map((n, i) => (i === given ? (n % 9) + 1 : n || '.')).join('');
  assert.equal((await client.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'example-classic', cells: tamper } })).isError, true);
  assert.equal((await client.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'example-classic', cells: '123' } })).isError, true);
  assert.equal((await client.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'nope', cells: tamper } })).isError, true);

  // solve it through reports: the check says solved
  report = await client.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'example-classic', cells: solution, selected: 0 } });
  assert.ok(!report.isError);
  const solved = await client.callTool({ name: 'zensudoku_check', arguments: {} });
  assert.equal(solved.structuredContent.solved, true);
  assert.equal((await client.callTool({ name: 'zensudoku_hint', arguments: {} })).structuredContent.kind, 'solved');

  // zensudoku_new with a given puzzle: accepted when unique, refused otherwise
  const own = await client.callTool({ name: 'zensudoku_new', arguments: { puzzle: catalog.givens.replace(/0/g, '.') } });
  assert.ok(!own.isError);
  assert.match(own.structuredContent.puzzleId, /^custom-\d{81}$/);
  const many = await client.callTool({ name: 'zensudoku_new', arguments: { puzzle: '.'.repeat(80) + '1' } });
  assert.equal(many.isError, true);
  assert.match(text(many), /more than one solution/);
  const short = await client.callTool({ name: 'zensudoku_new', arguments: { puzzle: '123' } });
  assert.equal(short.isError, true);
  assert.match(text(short), /81 cells/);
  assert.equal(JSON.stringify((await client.callTool({ name: 'zensudoku_state', arguments: {} })).structuredContent.puzzleId), JSON.stringify(own.structuredContent.puzzleId), 'a refused puzzle leaves the open one alone');

  // without a data folder the library is empty, and says why
  const nolib = await client.callTool({ name: 'zensudoku_library', arguments: {} });
  assert.equal(nolib.structuredContent.available, false);
  assert.match(text(nolib), /no data folder/);
  assert.equal((await client.callTool({ name: 'zensudoku_open', arguments: { id: 'x' } })).isError, true);

  console.log(`mcp smoke ok: ${names.length} tools, ${resources.length} resources, ${ui.contents[0].text.length} byte UI`);
} finally {
  await client.close();
}

// ---- with a library ----
const BOXES4 = '[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]]';
const TINY = `{ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]],re:${BOXES4},ca:[{v:'title: Tiny'},{v:'author: A. Setter'},{v:'rules: Normal sudoku rules apply.'}]}`;
const LINE = TINY.replace('re:', 'l:[{wp:[[0.5,0.5],[1.5,1.5]],c:CFCFCF,th:10}],re:');
const data = mkdtempSync(join(tmpdir(), 'zensudoku-smoke-'));
mkdirSync(join(data, 'library', 'set'), { recursive: true });
writeFileSync(join(data, 'library', 'set', 'a.json'), JSON.stringify({ id: 'tiny-1', collection: 'Set', number: 'T1', title: 'Tiny', author: 'A. Setter', video: 'https://youtu.be/abcDEF12345', source: 'scl' + LZ.compressToBase64(TINY) }));
writeFileSync(join(data, 'library', 'set', 'line.txt'), 'scl' + LZ.compressToBase64(LINE));
writeFileSync(join(data, 'library', 'set', 'broken.json'), '{');
const withLib = new Client({ name: 'smoke-lib', version: '0' });
await withLib.connect(new StdioClientTransport({ command: manifest.server.command, args: manifest.server.args, cwd: root, env: { PATH: process.env.PATH ?? '', ZEN_PLUGIN_DATA: data } }));
try {
  const lib = await withLib.callTool({ name: 'zensudoku_library', arguments: {} });
  assert.equal(lib.structuredContent.available, true);
  assert.deepEqual(lib.structuredContent.entries.map(e => e.id), ['line', 'tiny-1']);
  assert.equal(lib.structuredContent.errors, 1);
  assert.match(text(lib), /tiny-1: T1 · Tiny \(A\. Setter\) \[Set\]/);
  assert.equal((await withLib.callTool({ name: 'zensudoku_library', arguments: { query: 'setter' } })).structuredContent.count, 1);

  const opened = await withLib.callTool({ name: 'zensudoku_open', arguments: { id: 'tiny-1' } });
  assert.ok(!opened.isError, text(opened));
  assert.equal(opened.structuredContent.puzzleId, 'lib-tiny-1');
  assert.equal(opened.structuredContent.rows, 4);
  assert.match(text(opened), /Rules: Normal sudoku rules apply\./);
  assert.ok(!JSON.stringify(opened).includes('scl'), 'the source is not sent to the model');
  const src = await withLib.callTool({ name: 'zensudoku_puzzle', arguments: { puzzleId: 'lib-tiny-1' } });
  assert.match(src.structuredContent.source, /^scl/);
  assert.equal(src.structuredContent.library.collection, 'Set');

  // the UI reports a board; state, check and hint see it
  const SOL = '1234341221434321';
  let r = await withLib.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'lib-tiny-1', cells: '12.4...2' + '2.4....1', selected: 2 } });
  assert.ok(!r.isError, text(r));
  assert.equal((await withLib.callTool({ name: 'zensudoku_state', arguments: {} })).structuredContent.filled, 7);
  const h = await withLib.callTool({ name: 'zensudoku_hint', arguments: {} });
  assert.match(h.structuredContent.kind, /^(naked|hidden)$/);
  assert.match(h.structuredContent.cell, /^R[1-4]C[1-4]$/);
  r = await withLib.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'lib-tiny-1', cells: SOL } });
  assert.equal((await withLib.callTool({ name: 'zensudoku_check', arguments: {} })).structuredContent.solved, true);

  // a variant without a solution: full and repeat-free is as far as the server can tell
  await withLib.callTool({ name: 'zensudoku_open', arguments: { id: 'line' } });
  r = await withLib.callTool({ name: 'zensudoku_report', arguments: { puzzleId: 'lib-line', cells: SOL } });
  assert.ok(!r.isError);
  const full = await withLib.callTool({ name: 'zensudoku_check', arguments: {} });
  assert.equal(full.structuredContent.solved, false);
  assert.equal(full.structuredContent.full, true);
  assert.match(text(full), /variant rules can't be checked here/);
  assert.equal((await withLib.callTool({ name: 'zensudoku_hint', arguments: {} })).structuredContent.kind, 'unavailable');

  // zensudoku_new takes a SudokuPad source too
  const own = await withLib.callTool({ name: 'zensudoku_new', arguments: { puzzle: 'scl' + LZ.compressToBase64(TINY) } });
  assert.ok(!own.isError, text(own));
  assert.match(own.structuredContent.puzzleId, /^pad-[0-9a-f]{16}$/);
  assert.equal((await withLib.callTool({ name: 'zensudoku_puzzle', arguments: { puzzleId: own.structuredContent.puzzleId } })).isError, undefined);
  assert.equal((await withLib.callTool({ name: 'zensudoku_new', arguments: { puzzle: 'sclnotapuzzle' } })).isError, true);
  console.log('mcp smoke ok: library, open, report, check, hint and SudokuPad sources');
} finally {
  await withLib.close();
  rmSync(data, { recursive: true, force: true });
}
