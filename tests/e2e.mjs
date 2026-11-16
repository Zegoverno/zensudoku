// End-to-end in headless Chromium (Playwright) against the built files:
//   1. the PWA (shells/web/dist): sees the example puzzle, enters a digit, undoes it, uses notes,
//      keeps progress across a reload, takes a hint, checks an entered puzzle, and works offline;
//   2. the MCP App (ui/dist/index.html) in a sandboxed iframe under a minimal test host: handshake,
//      a tool result opens a puzzle, and each change is reported to the server and the model context.
// `node tests/e2e.mjs`   (`SHOTS=/some/dir node tests/e2e.mjs` also writes screenshots there)
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'shells/web/dist');
for (const f of [path.join(dist, 'index.html'), path.join(root, 'ui/dist/index.html')]) assert.ok(existsSync(f), `${f} is missing: run npm run build`);
const catalog = JSON.parse(readFileSync(path.join(root, 'core/catalog.json'), 'utf8')).puzzles[0];
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const HOST = `<!doctype html><meta charset=utf-8><title>host</title><body style="margin:0"><iframe id=f sandbox="allow-scripts" style="width:560px;height:1100px;border:0"></iframe><script>
window.calls = []; window.contexts = []; window.ready = false;
const frame = document.getElementById('f');
const reply = (id, result) => frame.contentWindow.postMessage({ jsonrpc: '2.0', id, result }, '*');
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data;
  if (m.method === 'ui/initialize') reply(m.id, { protocolVersion: '2026-01-26', hostInfo: { name: 'test-host', version: '0' }, hostCapabilities: {}, hostContext: { theme: 'dark', displayMode: 'inline', zen: { pane: 'board', path: null, mode: 'edit', slot: 'game' } } });
  else if (m.method === 'ui/notifications/initialized') window.ready = true;
  else if (m.method === 'tools/call') { window.calls.push(m.params); reply(m.id, { content: [{ type: 'text', text: 'ok' }] }); }
  else if (m.method === 'ui/update-model-context') { window.contexts.push(m.params); reply(m.id, {}); }
  else if (m.id !== undefined) reply(m.id, {});
});
window.sendResult = structuredContent => frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: 'opened' }], structuredContent } }, '*');
fetch('/ui.html').then(r => r.text()).then(html => { frame.srcdoc = html; });
</script>`;

const http = createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (url === '/host.html') { res.setHeader('content-type', 'text/html'); return res.end(HOST); }
  const file = url === '/ui.html' ? path.join(root, 'ui/dist/index.html') : path.join(dist, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !existsSync(file)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(r => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const shot = (page, name) => shots ? page.screenshot({ path: path.join(shots, name + '.png') }) : null;
const errors = [];
const watch = page => { page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };

const givenCount = catalog.givens.replace(/0/g, '').length;
async function firstEmpty(scope) {
  const i = await scope.locator('.grid button:not(.given)[data-value=""]').first().getAttribute('data-cell');
  return Number(i);
}

try {
  // ---- 1. the PWA ----
  const context = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(base);
  await page.waitForSelector('.grid');
  await shot(page, 'pwa-example');

  // the example puzzle, plainly named
  assert.equal(await page.title(), 'zensudoku');
  assert.match(await page.locator('.info strong').textContent(), /Example — classic/);
  assert.equal(await page.locator('.grid button[data-value]:not([data-value=""])').count(), givenCount);
  assert.equal(await page.locator('.grid button.given').count(), givenCount);
  assert.match(await page.locator('.progress [role=status]').textContent(), new RegExp(`${givenCount} of 81 filled`));

  // a digit goes in, undo takes it out, redo puts it back
  const cell = await firstEmpty(page);
  const at = page.locator(`[data-cell="${cell}"]`);
  await at.click();
  await page.keyboard.press('7');
  assert.equal(await at.getAttribute('data-value'), '7');
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await at.getAttribute('data-value'), '');
  await page.getByRole('button', { name: 'Redo' }).click();
  assert.equal(await at.getAttribute('data-value'), '7');
  await page.keyboard.press('Control+z');
  assert.equal(await at.getAttribute('data-value'), '');

  // a given is protected; a corner note and a center note; a color
  const given = Number(await page.locator('.grid button.given').first().getAttribute('data-cell'));
  const givenValue = await page.locator(`[data-cell="${given}"]`).getAttribute('data-value');
  await page.locator(`[data-cell="${given}"]`).click();
  await page.keyboard.press('9'); await page.keyboard.press('Delete');
  assert.equal(await page.locator(`[data-cell="${given}"]`).getAttribute('data-value'), givenValue);
  await at.click();
  await page.getByRole('button', { name: 'Corner', exact: true }).click();
  await page.keyboard.press('1'); await page.keyboard.press('3');
  assert.equal(await at.getAttribute('data-corner'), '13');
  await page.getByRole('button', { name: 'Center', exact: true }).click();
  await page.keyboard.press('2');
  assert.equal(await at.getAttribute('data-center'), '2');
  await page.getByRole('button', { name: 'Color Blue' }).click();
  assert.equal(await at.getAttribute('data-color'), '5');
  await shot(page, 'pwa-notes');
  await page.getByRole('button', { name: 'Value', exact: true }).click();
  const sol = catalog.solution[cell];
  await page.keyboard.press(sol);
  assert.equal(await at.getAttribute('data-value'), sol);
  assert.equal(await at.getAttribute('data-corner'), '', 'placing a number clears its notes');

  // progress survives a reload
  await page.reload();
  await page.waitForSelector('.grid');
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-value'), sol);
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-color'), '5');

  // a hint names one cell, and puts nothing on the board
  const before = await page.locator('.grid button[data-value]:not([data-value=""])').count();
  await page.getByRole('button', { name: 'Hint' }).click();
  const hint = await page.getByTestId('hint').textContent();
  assert.match(hint, /R\dC\d/);
  assert.equal(await page.locator('.grid button[data-value]:not([data-value=""])').count(), before);
  await shot(page, 'pwa-hint');

  // Enter a puzzle: refused with a reason, then accepted
  await page.getByText('Enter a puzzle', { exact: true }).click();
  const box = page.getByLabel('Puzzle text');
  await box.fill('123');
  await page.getByRole('button', { name: 'Play it' }).click();
  assert.match(await page.getByTestId('entry-error').textContent(), /81 cells/);
  await box.fill('.'.repeat(80) + '1');
  await page.getByRole('button', { name: 'Play it' }).click();
  assert.match(await page.getByTestId('entry-error').textContent(), /more than one solution/);
  await box.fill(catalog.givens.replace(/0/g, '.').replace(/(.{9})/g, '$1\n'));
  await page.getByRole('button', { name: 'Play it' }).click();
  assert.match(await page.locator('.info strong').textContent(), /Entered puzzle/);
  assert.equal(await page.getByTestId('entry-error').count(), 0);
  assert.equal(await page.locator('.grid button.given').count(), givenCount);
  await shot(page, 'pwa-entered');
  // the example is still there, with its progress
  await page.locator('.filters select').last().selectOption('example-classic');
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-value'), sol);

  // installable and offline: a manifest, and a service worker that serves the page without a network
  const manifest = await (await page.request.get(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal((await page.request.get(base + '/' + icon.src)).status(), 200, icon.src);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.grid');
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-value'), sol);
  await context.setOffline(false);

  // solving the example by hand ends in a locked, celebrated board
  const fresh = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  const p2 = await fresh.newPage();
  await p2.goto(base);
  await p2.waitForSelector('.grid');
  for (let i = 0; i < 81; i++) {
    if (catalog.givens[i] !== '0') continue;
    await p2.locator(`[data-cell="${i}"]`).click();
    await p2.keyboard.press(catalog.solution[i]);
  }
  assert.match(await p2.locator('.progress [role=status]').textContent(), /Puzzle complete/);
  await shot(p2, 'pwa-solved');
  await fresh.close();
  await context.close();

  // ---- 2. the MCP App in a sandboxed iframe under a test host ----
  const hostPage = await (await browser.newContext({ viewport: { width: 600, height: 1150 } })).newPage();
  watch(hostPage);
  await hostPage.goto(base + '/host.html');
  const ui = hostPage.frameLocator('#f');
  await ui.locator('.grid').waitFor();
  await hostPage.waitForFunction(() => window.ready);
  // the host's theme reaches the UI
  assert.equal(await ui.locator('html').getAttribute('data-theme'), 'dark');
  // zenbot's host context (slot 'game') is read; a host without it (the PWA above, Claude) is fine too
  assert.equal(await ui.locator('html').getAttribute('data-slot'), 'game');
  assert.equal(await ui.locator('html').getAttribute('data-pane'), 'board');
  assert.match(await ui.locator('.info strong').textContent(), /Example — classic/);

  // a tool result from the agent opens the puzzle it names
  const custom = 'custom-' + catalog.givens;
  await hostPage.evaluate(id => window.sendResult({ puzzleId: id }), custom);
  await ui.locator('.info strong', { hasText: 'Entered puzzle' }).waitFor();
  await hostPage.evaluate(() => { window.calls.length = 0; window.contexts.length = 0; });

  // each change is reported to the server (app-only tool) and to the model context
  const cell2 = await firstEmpty(ui);
  await ui.locator(`[data-cell="${cell2}"]`).click();
  await ui.locator(`[data-cell="${cell2}"]`).press('6');
  await hostPage.waitForFunction(c => window.calls.some(k => k.arguments.cells[c] === '6') && window.contexts.some(k => /6/.test(k.content[0].text.split('\n').slice(1, 12).join(''))), cell2);
  const call = await hostPage.evaluate(c => window.calls.findLast(k => k.arguments.cells[c] === '6'), cell2);
  assert.equal(call.name, 'zensudoku_report');
  assert.equal(call.arguments.puzzleId, custom);
  assert.equal(call.arguments.cells[cell2], '6');
  assert.equal(call.arguments.cells.length, 81);
  const context2 = await hostPage.evaluate(() => window.contexts.at(-1));
  assert.match(context2.content[0].text, /Sudoku "Entered puzzle"[\s\S]*------\+-------\+------/);
  assert.match(context2.content[0].text, /6/);
  await shot(hostPage, 'host-app');
  // the sandbox has no localStorage; the game still plays (progress is kept in memory)
  await ui.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await ui.locator(`[data-cell="${cell2}"]`).getAttribute('data-value'), '');

  assert.deepEqual(errors.filter(e => !/localStorage|Failed to read the 'localStorage'|SecurityError|sandbox/i.test(e)), [], 'no page errors');
  console.log('e2e ok: PWA (play, undo, notes, reload, hint, enter, offline, solve) and MCP App (handshake, result, report)');
} finally {
  await browser.close();
  http.close();
}
