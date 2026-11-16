// MCP smoke test: start the built server (mcp/dist/server.js) over stdio with the SDK client, list
// tools and resources, read the ui:// resource, and call every tool once.
// `node tests/mcp-smoke.mjs [plugin-folder]`: the folder defaults to this repository; tests/pack-test.mjs
// passes the unpacked release archive, so the same checks run against exactly what ships.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  assert.deepEqual(names, ['zensudoku_check', 'zensudoku_hint', 'zensudoku_new', 'zensudoku_report', 'zensudoku_state']);
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  assert.equal(byName.zensudoku_new._meta.ui.resourceUri, 'ui://zensudoku/app');
  assert.deepEqual(byName.zensudoku_report._meta.ui.visibility, ['app']);
  assert.equal(manifest.contributes.commands[0].tool, 'zensudoku_new');
  assert.ok(names.includes(manifest.contributes.commands[0].tool));
  assert.deepEqual(manifest.kernel, []);
  assert.equal(manifest.name, 'zensudoku');
  assert.deepEqual(manifest.contributes.games.map(g => [g.id, g.ui]), [['sudoku', 'ui://zensudoku/app']]);
  assert.equal(manifest.contributes.views, undefined, 'the board lives in the games slot, not a view');
  assert.ok(names.every(n => n.startsWith('zensudoku_')));

  // resources
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

  console.log(`mcp smoke ok: ${names.length} tools, 1 resource, ${ui.contents[0].text.length} byte UI`);
} finally {
  await client.close();
}
