// End-to-end in headless Chromium (Playwright) against the built files:
//   1. the PWA (shells/web/dist): sees the example puzzle, enters a digit, undoes it, uses notes,
//      keeps progress across a reload, takes a hint, checks an entered puzzle, and works offline;
//   2. the MCP App (ui/dist/index.html) in a sandboxed iframe under a minimal test host: handshake,
//      a tool result opens a puzzle, and each change is reported to the server and the model context;
//      zenbot's host context (theme, --color-* variables, containerDimensions, zen) is followed live:
//      its title and close are the host's, and the board fits 1100, 390 and 280 px containers;
//   3. SudokuPad puzzles (hand-made here): imported in the PWA, and opened from the library in the MCP App.
// `node tests/e2e.mjs`   (`SHOTS=/some/dir node tests/e2e.mjs` also writes screenshots there)
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import LZ from 'lz-string';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'shells/web/dist');
for (const f of [path.join(dist, 'index.html'), path.join(root, 'ui/dist/index.html')]) assert.ok(existsSync(f), `${f} is missing: run npm run build`);
const catalog = JSON.parse(readFileSync(path.join(root, 'core/catalog.json'), 'utf8')).puzzles[0];
// A 4×4 SudokuPad puzzle with 2×2 boxes, and the same with a drawn line (a variant: no hints).
const BOXES4 = '[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]]';
const TINY = `{ce:[[{v:1},{v:2},,],[,,,{v:2}],[{v:2},,{v:4},],[,,,{v:1}]],re:${BOXES4},ca:[{v:'title: Tiny'},{v:'author: A. Setter'},{v:'rules: Normal sudoku rules apply.'}],vd:[{id:'abcDEF12345',t:'Video'}]}`;
const SANDWICH_SOURCE = JSON.stringify({
  cells: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({}))),
  regions: Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, i) =>
    [Math.floor(b / 3) * 3 + Math.floor(i / 3), b % 3 * 3 + i % 3])),
  overlays: [{ center: [-.5, .5], text: '5' }, { center: [.5, .5], text: '8' }],
  metadata: { rules: 'Standard sudoku rules apply. Outside clue sums are not supplied here.' },
});
const SANDWICH_RULE_SOURCE = SANDWICH_SOURCE.replace(
  'Outside clue sums are not supplied here.',
  'The clues outside the grid give the sum of digits between 1 and 9 in the corresponding row or column.',
);
const TINY_SCL = 'scl' + LZ.compressToBase64(TINY);
// The same 4×4 in a 6×6 array under two rows and beside two columns of clues (a clue, a long text, one outside region).
const OUT_L = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6), i % 6]).filter(([r, c]) => r < 2 || c < 2).map(rc => `[${rc}]`);
const OUT_BOXES = [[2, 2], [2, 4], [4, 2], [4, 4]].map(([r, c]) => `[[${r},${c}],[${r},${c + 1}],[${r + 1},${c}],[${r + 1},${c + 1}]]`);
const OUT_SCL = 'scl' + LZ.compressToBase64(`{ce:[[,,,{v:7},,],[,,,,,],[,,{v:1},{v:2},,],[,,,,,{v:2}],[,,{v:2},,{v:4},],[,,,,,{v:1}]],re:[[${OUT_L}],${OUT_BOXES}],o:[{ct:[0.5,0.5],w:1,h:1,c1:#0,fs:12,te:'Ath + Bth'}]}`);
const LINE_SCL = 'scl' + LZ.compressToBase64(TINY.replace('re:', 'l:[{wp:[[0.5,0.5],[1.5,1.5]],c:CFCFCF,th:10}],re:'));
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const VARS = { '--color-background-primary': '#f4f1ea', '--color-background-secondary': '#eae6dc', '--color-border-primary': '#cfc9b8', '--color-text-primary': '#22241f', '--color-text-secondary': '#5f6258', '--color-text-info': '#3d6b3a', '--color-ring-primary': '#3d6b3a', '--color-background-info': '#dde8d6', '--color-text-inverse': '#fbfaf6', '--color-text-danger': '#a8402f', '--border-radius-sm': '3px', '--border-radius-md': '9px', '--border-radius-lg': '14px', '--border-radius-full': '999px', '--font-sans': 'Georgia, serif', '--font-mono': 'Courier, monospace', '--shadow-md': '0 2px 8px rgba(0,0,0,.2)' };
const HOST = `<!doctype html><meta charset=utf-8><title>host</title><body style="margin:0"><iframe id=f sandbox="allow-scripts" style="width:560px;height:1100px;border:0"></iframe><script>
const VARS = ${JSON.stringify(VARS)};
let ctx = { theme: 'dark', displayMode: 'inline', styles: { variables: VARS }, containerDimensions: { width: 560, height: 1100 }, zen: { pane: 'board', phone: false, slot: 'game', headingFont: 'Georgia, serif' } };
if (location.search === '?native-theme') ctx.styles = undefined;
const helper = location.pathname === '/helper-host.html';
if (helper) {
  frameSize();
  ctx = { ...ctx, theme: 'dark', styles: undefined, containerDimensions: { width: 360, height: 850 }, zen: { pane: 'side', slot: 'view' } };
}
function frameSize() { const el = document.getElementById('f'); el.style.width = '360px'; el.style.height = '850px'; }
window.calls = []; window.contexts = []; window.zenmsgs = []; window.links = []; window.ready = false; window.toolReply = null;
const frame = document.getElementById('f');
const reply = (id, result) => frame.contentWindow.postMessage({ jsonrpc: '2.0', id, result }, '*');
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data;
  if (m.method === 'ui/initialize') reply(m.id, { protocolVersion: '2026-01-26', hostInfo: { name: 'test-host', version: '0' }, hostCapabilities: {}, hostContext: ctx });
  else if (m.method === 'ui/notifications/initialized') window.ready = true;
  else if (m.method && m.method.startsWith('zen/')) window.zenmsgs.push(m);
  else if (m.method === 'tools/call') { window.calls.push(m.params); if (window.liveTools && (!window.ignoreReports || m.params.name !== 'zensudoku_report')) window.liveTools(m.params).then(result => reply(m.id, result)); else reply(m.id, (window.toolReply && window.toolReply(m.params)) || { content: [{ type: 'text', text: 'ok' }] }); }
  else if (m.method === 'ui/open-link') { window.links.push(m.params.url); reply(m.id, {}); }
  else if (m.method === 'ui/update-model-context') { window.contexts.push(m.params); reply(m.id, {}); }
  else if (m.id !== undefined) reply(m.id, {});
});
window.setContext = patch => { ctx = { ...ctx, ...patch }; frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: patch }, '*'); };
window.resize = (w, h, zen) => { frame.style.width = w + 'px'; frame.style.height = h + 'px'; window.setContext({ containerDimensions: { width: w, height: h }, ...(zen ? { zen: { ...ctx.zen, ...zen } } : {}) }); };
window.zenSend = (method, params) => frame.contentWindow.postMessage({ jsonrpc: '2.0', method, params }, '*');
window.sendResult = structuredContent => frame.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: 'opened' }], structuredContent } }, '*');
fetch(helper ? '/helper.html' : '/ui.html').then(r => r.text()).then(html => { frame.srcdoc = html; });
</script>`;

const mcp = new Client({ name: 'e2e', version: '0' });
await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['mcp/dist/server.js'], cwd: root, env: { PATH: process.env.PATH ?? '' } }));
const helperHtml = (await mcp.readResource({ uri: 'ui://zensudoku/helper' })).contents[0].text;

const http = createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (url === '/host.html' || url === '/helper-host.html') { res.setHeader('content-type', 'text/html'); return res.end(HOST); }
  if (url === '/helper.html') { res.setHeader('content-type', 'text/html'); return res.end(helperHtml); }
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

  const clear = page.getByRole('switch', { name: 'Auto-clear notes' });
  assert.equal(await clear.isChecked(), true);
  const peer = page.locator('[data-cell="3"]');
  await peer.click();
  await peer.press('c');
  await peer.press('7');
  await peer.press('m');
  await peer.press('7');
  await peer.press('v');

  // a digit goes in, undo takes it out, redo puts it back
  const cell = await firstEmpty(page);
  const at = page.locator(`[data-cell="${cell}"]`);
  await at.click();
  await page.keyboard.press('7');
  assert.equal(await at.getAttribute('data-value'), '7');
  assert.equal(await peer.getAttribute('data-corner'), '');
  assert.equal(await peer.getAttribute('data-center'), '');
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await at.getAttribute('data-value'), '');
  assert.equal(await peer.getAttribute('data-corner'), '7');
  assert.equal(await peer.getAttribute('data-center'), '7');
  await page.getByRole('button', { name: 'Redo' }).click();
  assert.equal(await peer.getAttribute('data-center'), '');
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

  await clear.uncheck();
  // progress and the setting survive a reload
  await page.reload();
  assert.equal(await clear.isChecked(), false);
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
  await page.getByRole('button', { name: 'Puzzles' }).click();
  await page.locator('[data-id="example-classic"]').click();
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-value'), sol);

  // Import a SudokuPad puzzle: refused with a reason, then drawn and played (digits 1–4 on a 4×4)
  await page.getByText('Import a SudokuPad puzzle', { exact: true }).click();
  const padBox = page.getByLabel('SudokuPad source');
  await padBox.fill('Xy7Kq2Lm9P');
  await page.getByRole('button', { name: 'Import' }).click();
  assert.match(await page.getByTestId('import-error').textContent(), /short id/);
  await padBox.fill(TINY_SCL);
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByTestId('pad-drawing').waitFor();
  assert.equal(await page.locator('.grid.pad [data-cell]').count(), 16);
  assert.equal(await page.locator('.grid.pad .given').count(), 6);
  assert.match(await page.getByTestId('author').textContent(), /A\. Setter/);
  assert.match(await page.getByTestId('rules').textContent(), /Normal sudoku rules apply/);
  assert.equal(await page.getByTestId('video').getAttribute('href'), 'https://youtu.be/abcDEF12345');
  assert.equal(await page.locator('.digits button').count(), 4);
  await page.locator('[data-cell="2"]').click();
  await page.keyboard.press('5');
  assert.equal(await page.locator('[data-cell="2"]').getAttribute('data-value'), '', 'no 5 on a 4×4');
  await page.keyboard.press('3');
  assert.equal(await page.locator('[data-cell="2"]').getAttribute('data-value'), '3');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('3');
  assert.match(await page.getByTestId('status').textContent(), /3 repeats in row 1/);
  await page.keyboard.press('Delete');
  await shot(page, 'pwa-sudokupad');
  // clue rows and columns outside the regions are not the grid: no cell to select, no lines or borders there
  await padBox.fill(OUT_SCL);
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByTestId('pad-drawing').waitFor();
  assert.equal(await page.locator('.grid.pad [data-cell]').count(), 16, 'only the 4×4 can be played');
  assert.match(await page.locator('.paddraw .gridlines').getAttribute('d'), /^M2 2H6/, 'grid lines start at the grid');
  const edges = await page.locator('.paddraw .regions').getAttribute('d');
  assert.ok(edges.match(/[\d.]+/g).every(n => Number(n) >= 2), 'no region border outside the grid: ' + edges);
  await shot(page, 'pwa-sudokupad-outside');
  await padBox.fill(TINY_SCL);
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByTestId('pad-drawing').waitFor();
  // it survives a reload, and the Library (l) lists it as imported
  await page.reload();
  await page.getByTestId('pad-drawing').waitFor();
  assert.equal(await page.locator('[data-cell="2"]').getAttribute('data-value'), '3');
  await page.locator('[data-cell="2"]').click();
  await page.keyboard.press('l');
  await page.getByRole('dialog', { name: 'Puzzle picker' }).waitFor();
  assert.match(await page.getByTestId('library-item').filter({ hasText: 'Tiny' }).textContent(), /•\s*Tiny/);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Puzzle picker' }).count(), 0);
  await page.getByRole('button', { name: 'Puzzles' }).click();
  await page.locator('[data-id="example-classic"]').click();
  assert.equal(await page.locator(`[data-cell="${cell}"]`).getAttribute('data-value'), sol);

  // Generic numeric artwork is inert; the same number is actionable with explicit sandwich rules.
  await page.setViewportSize({ width: 1100, height: 850 });
  for (const source of [SANDWICH_SOURCE, SANDWICH_RULE_SOURCE]) {
    if (!await padBox.isVisible()) await page.getByText('Import a SudokuPad puzzle', { exact: true }).click();
    await padBox.fill(source);
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByTestId('pad-drawing').waitFor();
    assert.equal(await page.getByTestId('clue-calculator').count(), source === SANDWICH_RULE_SOURCE ? 1 : 0);
  }
  const sandwich = page.getByRole('button', { name: 'Sandwich sum 5' });
  const sandwichResults = page.locator('[data-testid=clue-results]:popover-open');
  await sandwich.hover();
  await sandwichResults.waitFor();
  assert.match(await sandwichResults.textContent(), /2 \+ 3/);
  await page.mouse.move(1080, 820);
  await sandwichResults.waitFor({ state: 'hidden' });
  await page.keyboard.press('Tab');
  await sandwich.focus();
  await sandwichResults.waitFor();
  await page.emulateMedia({ colorScheme: 'light' });
  await shot(page, 'contextual-desktop-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'contextual-desktop-dark');
  await page.keyboard.press('Escape');
  await sandwichResults.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Puzzles' }).click();
  await page.locator('[data-id="example-classic"]').click();
  await page.setViewportSize({ width: 430, height: 1000 });

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

  // with zenbot as the host, the title and close are its own: the app draws none
  assert.equal(await ui.locator('html').getAttribute('data-zen'), '');
  assert.equal(await ui.locator('h1').count(), 0);
  assert.equal(await ui.locator('.eyebrow').count(), 0);
  assert.ok(await ui.getByRole('button', { name: 'Puzzles' }).isVisible(), 'the game action stays');
  // colours, radii and fonts come from the host's variables
  const style = sel => ui.locator(sel).first().evaluate(el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color, radius: c.borderTopLeftRadius, font: c.fontFamily }; });
  assert.equal((await style('body')).bg, 'rgb(244, 241, 234)');
  assert.equal((await style('.digits button')).bg, 'rgb(234, 230, 220)');
  assert.equal((await style('.digits button')).radius, '9px');
  assert.match((await style('body')).font, /Georgia/);
  assert.match(await ui.locator('textarea').evaluate(el => getComputedStyle(el).fontFamily), /Courier/);
  await ui.locator('[data-cell]:not(.given)').first().click();
  assert.equal(await ui.locator('.grid .selected').first().evaluate(el => getComputedStyle(el).boxShadow), 'rgb(61, 107, 58) 0px 0px 0px 2px inset');
  // the theme follows the host live, both ways
  await hostPage.evaluate(() => window.setContext({ theme: 'light' }));
  await ui.locator('html[data-theme="light"]').waitFor();
  await hostPage.evaluate(() => window.setContext({ theme: 'dark' }));
  await ui.locator('html[data-theme="dark"]').waitFor();
  await hostPage.evaluate(() => window.setContext({ styles: { variables: { ...VARS, '--color-background-primary': '#101410' } } }));
  await ui.locator('body').evaluate(el => new Promise(r => { const t = () => (getComputedStyle(el).backgroundColor === 'rgb(16, 20, 16)' ? r() : setTimeout(t, 20)); t(); }));
  await hostPage.evaluate(() => window.setContext({ styles: { variables: VARS } }));
  // the board follows the container: wide pane, phone, narrow side panel; never a sideways scroll
  const fit = async (w, h, zen, check) => {
    await hostPage.evaluate(([w, h, zen]) => window.resize(w, h, zen), [w, h, zen]);
    await ui.locator('.games').waitFor();
    await hostPage.waitForTimeout(150);
    const m = await ui.locator('html').evaluate(() => {
      const g = document.querySelector('.grid').getBoundingClientRect(), r = document.documentElement;
      return { grid: Math.round(g.width), right: Math.round(g.right), scroll: r.scrollWidth, client: r.clientWidth, wide: document.querySelector('.games').classList.contains('wide'), square: Math.abs(g.width - g.height) < 1 };
    });
    assert.ok(m.scroll <= m.client, `${w}px: horizontal scroll (${m.scroll} > ${m.client})`);
    assert.ok(m.right <= w, `${w}px: the board overflows (${m.right})`);
    assert.ok(m.square, `${w}px: the board is square`);
    check(m);
    await shot(hostPage, `host-${w}`);
  };
  await hostPage.setViewportSize({ width: 1200, height: 1150 });
  await fit(1100, 760, { pane: 'board', phone: false }, m => { assert.ok(m.wide, 'wide pane: board beside controls'); assert.ok(m.grid > 400 && m.grid <= 760 - 32, `wide board ${m.grid}`); });
  await fit(390, 800, { pane: 'board', phone: true }, m => { assert.ok(!m.wide); assert.ok(m.grid >= 330 && m.grid <= 370, `phone board ${m.grid}`); });
  await fit(280, 700, { pane: 'side', phone: false }, m => { assert.ok(m.grid >= 230 && m.grid <= 260, `side board ${m.grid}`); });
  await hostPage.evaluate(() => window.resize(560, 1100, { pane: 'board', phone: false }));
  await hostPage.waitForTimeout(100);

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

  // ---- zenbot's keyboard model: commands declared, keys forwarded, commands run, focus ----
  const cmds = () => hostPage.evaluate(() => window.zenmsgs.filter(m => m.method === 'zen/commands').at(-1)?.params.commands.map(c => c.id).join(','));
  // (a bare modifier keydown is forwarded too; the contract says every keydown)
  const keys = () => hostPage.evaluate(() => window.zenmsgs.filter(m => m.method === 'zen/key').map(m => m.params).filter(k => k.key !== 'Control'));
  await hostPage.waitForFunction(() => window.zenmsgs.some(m => m.method === 'zen/commands'));
  const first = await hostPage.evaluate(() => window.zenmsgs.find(m => m.method === 'zen/commands').params.commands);
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'toggle-auto-clear' }));
  await ui.getByRole('switch', { name: 'Auto-clear notes', checked: false }).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'toggle-auto-clear' }));
  await ui.getByRole('switch', { name: 'Auto-clear notes', checked: true }).waitFor();
  // one bundled puzzle: nothing to start, so "New game" is not declared; the rest is, with zenbot's key forms
  assert.deepEqual(first.filter(c => c.ring).map(c => c.id), ['restart', 'hint']);
  assert.deepEqual(first.map(c => [c.id, c.key]).filter(([, k]) => k), [['hint', 'h'], ['library', 'l']]);
  assert.deepEqual(first.map(c => c.id), ['restart', 'hint', 'toggle-notes', 'toggle-auto-clear', 'library']);
  // the entered puzzle makes another one available: New game (n) joins, first in the ring
  const latest = await hostPage.evaluate(() => window.zenmsgs.filter(m => m.method === 'zen/commands').at(-1).params.commands);
  assert.deepEqual(latest.slice(0, 2).map(c => [c.id, c.key, c.ring]), [['new-game', 'n', true], ['restart', undefined, true]]);
  // availability changes are sent again: after the Undo click above, Redo is available and Undo is not
  assert.match(await cmds(), /redo/);
  assert.doesNotMatch(await cmds(), /undo/);
  await ui.locator(`[data-cell="${cell2}"]`).click();
  await ui.locator(`[data-cell="${cell2}"]`).press('4');
  await hostPage.waitForFunction(() => window.zenmsgs.filter(m => m.method === 'zen/commands').at(-1).params.commands.some(c => c.id === 'undo' && c.key === 'Mod+z' && c.ring));
  // declared keys are only forwarded under zenbot, never acted on: Ctrl+Z, n and h leave the board alone
  await hostPage.evaluate(() => { window.zenmsgs.length = 0; });
  await ui.locator(`[data-cell="${cell2}"]`).press('Control+z');
  await ui.locator(`[data-cell="${cell2}"]`).press('n');
  await ui.locator(`[data-cell="${cell2}"]`).press('h');
  await hostPage.waitForFunction(() => window.zenmsgs.filter(m => m.method === 'zen/key').length >= 3);
  assert.equal(await ui.locator(`[data-cell="${cell2}"]`).getAttribute('data-value'), '4', 'Ctrl+Z is the host\'s, not the board\'s');
  assert.equal(await ui.locator('[data-testid="hint"]').textContent(), '', 'h is the host\'s');
  assert.match(await ui.locator('.info strong').textContent(), /Entered puzzle/, 'n is the host\'s');
  assert.deepEqual((await keys()).map(k => [k.key, k.ctrl, k.typing]), [['z', true, false], ['n', false, false], ['h', false, false]]);
  // the board's own keys (digits, arrows, v/c/m) are not forwarded
  await hostPage.evaluate(() => { window.zenmsgs.length = 0; });
  await ui.locator(`[data-cell="${cell2}"]`).press('5');
  await ui.locator(`[data-cell="${cell2}"]`).press('c');
  await ui.locator(`[data-cell="${cell2}"]`).press('ArrowRight');
  assert.equal(await ui.locator(`[data-cell="${cell2}"]`).getAttribute('data-value'), '5');
  assert.equal(await ui.getByRole('button', { name: 'Corner', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await keys(), []);
  // inside a text field only Ctrl/Meta keys are forwarded, with typing: true
  await ui.getByText('Enter a puzzle', { exact: true }).click();
  await ui.locator('textarea').click();
  await ui.locator('textarea').press('n');
  await ui.locator('textarea').press('Control+k');
  await hostPage.waitForFunction(() => window.zenmsgs.some(m => m.method === 'zen/key'));
  assert.deepEqual((await keys()).map(k => [k.key, k.ctrl, k.typing]), [['k', true, true]]);
  // zen/command runs the action; zen/focus puts the focus on the board
  await ui.getByRole('button', { name: 'Value', exact: true }).click();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'undo' }));
  await ui.locator(`[data-cell="${cell2}"][data-value="4"]`).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'redo' }));
  await ui.locator(`[data-cell="${cell2}"][data-value="5"]`).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'toggle-notes' }));
  await ui.getByRole('button', { name: 'Corner', exact: true }).and(ui.locator('[aria-pressed="true"]')).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'toggle-notes' }));
  await ui.getByRole('button', { name: 'Value', exact: true }).and(ui.locator('[aria-pressed="true"]')).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'hint' }));
  await ui.locator('[data-testid="hint"]:not(:empty)').waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'restart' }));
  await ui.locator(`[data-cell="${cell2}"]`).and(ui.locator('[data-value=""]')).waitFor();
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'new-game' }));  // one puzzle only: nothing to open, no error
  await ui.locator('textarea').click();
  await hostPage.evaluate(() => window.zenSend('zen/focus', { focused: false }));
  assert.equal(await ui.locator('[data-cell]:focus').count(), 0);
  await hostPage.evaluate(() => window.zenSend('zen/focus', { focused: true }));
  await ui.locator('[data-cell]:focus').waitFor();

  // ---- the library: the picker lists the server's puzzles; one opens, drawn, with its rules and video ----
  await hostPage.evaluate(([tiny, line]) => {
    const info = { id: 'tiny-1', collection: 'Set', number: 'T1', title: 'Tiny', author: 'A. Setter', video: 'https://youtu.be/abcDEF12345' };
    window.toolReply = p => p.name === 'zensudoku_library'
      ? { content: [{ type: 'text', text: '1 puzzle' }], structuredContent: { available: true, errors: 0, entries: [{ id: 'tiny-1', collection: 'Set', number: 'T1', title: 'Tiny', author: 'A. Setter', variants: ['classic'], difficulty: 'easy', tags: ['practice'] }] } }
      : p.name === 'zensudoku_puzzle' && p.arguments.puzzleId === 'lib-tiny-1' ? { content: [{ type: 'text', text: 'ok' }], structuredContent: { puzzleId: 'lib-tiny-1', source: tiny, library: info } }
      : p.name === 'zensudoku_puzzle' && p.arguments.puzzleId === 'lib-line' ? { content: [{ type: 'text', text: 'ok' }], structuredContent: { puzzleId: 'lib-line', source: line, library: { id: 'line' } } }
      : null;
  }, [TINY_SCL, LINE_SCL]);
  await hostPage.evaluate(() => window.zenSend('zen/command', { id: 'library' }));
  await ui.getByRole('dialog', { name: 'Puzzle picker' }).waitFor();
  await ui.locator('[data-id="tiny-1"]').waitFor();
  await ui.getByLabel('Search puzzles').fill('nothing like it');
  assert.equal(await ui.getByTestId('library-item').count(), 0);
  await ui.getByLabel('Search puzzles').fill('practice');
  assert.equal(await ui.getByTestId('library-item').count(), 1, 'search finds explicit tags');
  await ui.getByLabel('Difficulty').selectOption('unknown');
  assert.equal(await ui.getByTestId('library-item').count(), 0);
  await ui.getByLabel('Difficulty').selectOption('easy');
  await ui.getByLabel('Variant').selectOption('killer');
  assert.equal(await ui.getByTestId('library-item').count(), 0);
  await ui.getByLabel('Variant').selectOption('classic');
  assert.equal(await ui.getByTestId('library-item').count(), 1);
  await ui.getByLabel('Search puzzles').fill('');
  assert.match(await ui.getByRole('dialog', { name: 'Puzzle picker' }).textContent(), /Built-in.*Set/s);
  await ui.getByLabel('Search puzzles').fill('t1');
  await ui.getByLabel('Search puzzles').press('Enter');
  await ui.getByTestId('pad-drawing').waitFor();
  assert.equal(await ui.getByRole('dialog', { name: 'Puzzle picker' }).count(), 0);
  assert.match(await ui.locator('.info strong').textContent(), /T1 · Tiny/);
  assert.equal(await ui.locator('.grid.pad [data-cell]').count(), 16);
  await ui.locator('[data-cell="2"]').click();
  await ui.locator('[data-cell="2"]').press('3');
  await hostPage.waitForFunction(() => window.calls.some(c => c.name === 'zensudoku_report' && c.arguments.puzzleId === 'lib-tiny-1' && c.arguments.cells === '123....2' + '2.4....1'));
  await ui.getByTestId('video').click();
  await hostPage.waitForFunction(() => window.links.includes('https://youtu.be/abcDEF12345'));
  // a phone: one column, no sideways scroll
  await hostPage.evaluate(() => window.resize(390, 1000, { phone: true }));
  await ui.locator('.games.phone').waitFor();
  assert.ok(await ui.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'no sideways scroll at 390 px');
  await shot(hostPage, 'host-sudokupad-phone');
  // a tool result for a puzzle the board has not seen fetches it first; a variant offers no hint
  await hostPage.evaluate(() => window.sendResult({ puzzleId: 'lib-line' }));
  await ui.locator('.grid.pad polyline').first().waitFor();
  await ui.getByRole('button', { name: 'Hint' }).click();
  assert.match(await ui.getByTestId('hint').textContent(), /aren't available for this variant/);

  // Board and helper in separate sandboxed frames, connected to the same real MCP process.
  const cageSource = TINY.replace("ca:[", "ca:[{ce:[[0,2],[0,3]],v:5},");
  const openedCage = await mcp.callTool({ name: 'zensudoku_new', arguments: { puzzle: cageSource } });
  assert.ok(!openedCage.isError);
  const live = page => page.exposeFunction('liveTools', params => mcp.callTool(params));
  const boardPage = await browser.newPage({ viewport: { width: 390, height: 850 }, hasTouch: true });
  watch(boardPage);
  await live(boardPage);
  // Mount the board before enabling live calls so its initial example report cannot replace the fixture.
  await boardPage.addInitScript(() => { window.ignoreReports = true; });
  await boardPage.goto(base + '/host.html?native-theme');
  await boardPage.waitForFunction(() => window.ready);
  await boardPage.evaluate(id => {
    window.resize(390, 840, { phone: true });
    window.sendResult({ puzzleId: id });
  }, openedCage.structuredContent.puzzleId);
  const liveBoard = boardPage.frameLocator('#f');
  await liveBoard.locator('.grid.pad').waitFor();
  await ui.getByText('Sudoku helper', { exact: true }).click();
  await ui.getByLabel('Cage sum').waitFor();
  await ui.getByText('Sudoku helper', { exact: true }).click();
  assert.equal(await liveBoard.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(27, 28, 25)');
  const cageClue = liveBoard.getByRole('button', { name: 'Killer cage sum 5 in 2 cells' });
  const cageResults = liveBoard.locator('[data-testid=clue-results]:popover-open');
  await cageClue.tap();
  await cageResults.waitFor();
  assert.match(await cageResults.textContent(), /1 \+ 4.*2 \+ 3/s);
  await shot(boardPage, 'contextual-phone-390-dark');
  await boardPage.evaluate(() => window.setContext({ theme: 'light', styles: undefined }));
  await liveBoard.locator('html[data-theme=light]').waitFor();
  await shot(boardPage, 'contextual-phone-390-light');
  await cageClue.tap();
  assert.equal(await cageResults.count(), 0);
  await cageClue.hover();
  await cageResults.waitFor();
  await boardPage.mouse.move(380, 25);
  await cageResults.waitFor({ state: 'hidden' });
  await boardPage.keyboard.press('Tab');
  await liveBoard.locator('.grid [data-cell][tabindex="0"]').focus();
  await cageClue.focus();
  await cageResults.waitFor();
  await boardPage.keyboard.press('Escape');
  await cageResults.waitFor({ state: 'hidden' });
  const helperPage = await browser.newPage({ viewport: { width: 360, height: 850 } });
  watch(helperPage);
  await live(helperPage);
  await helperPage.goto(base + '/helper-host.html');
  const panel = helperPage.frameLocator('#f');
  await panel.getByRole('heading', { name: 'Tiny', exact: true }).waitFor();
  assert.equal(await panel.getByText('Normal sudoku rules apply.').count(), 1);
  await boardPage.evaluate(() => { window.ignoreReports = false; });
  await liveBoard.locator('[data-cell="2"]').tap();
  const selected = panel.getByTestId('selected-cage');
  await selected.getByText('R1C3 · 5 in 2 cells').waitFor();
  await liveBoard.getByRole('button', { name: 'Place 3' }).tap();
  await selected.locator('s').waitFor();
  assert.equal(await selected.locator('s').textContent(), '1 + 4');
  assert.match(await selected.textContent(), /2 \+ 3/);
  const killer = panel.getByRole('list', { name: 'Killer combinations' });
  await panel.getByLabel('Cage sum').fill('5');
  await panel.getByLabel('Cell count').fill('2');
  await panel.getByLabel('Must include').fill('3');
  assert.equal((await killer.textContent()).trim(), '2 + 3');
  await panel.getByLabel('Must exclude').fill('2');
  assert.match(await killer.textContent(), /No combinations/);
  await panel.getByLabel('Must exclude').fill('');
  await panel.getByText('Empty', { exact: true }).waitFor();
  await panel.getByLabel('Sandwich sum').fill('5');
  await panel.getByRole('heading', { name: '2 digits', exact: true }).waitFor();
  assert.equal(await panel.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await panel.locator('html[data-theme="dark"]').waitFor();
  await shot(helperPage, 'helper-360-dark');
  await helperPage.evaluate(() => window.setContext({ theme: 'light' }));
  await panel.locator('html[data-theme="light"]').waitFor();
  await shot(helperPage, 'helper-360-light');

  await liveBoard.locator('[data-cell="2"]').press('ArrowLeft');
  await selected.getByText(/R1C2 is not in a numbered cage/).waitFor();
  await mcp.callTool({ name: 'zensudoku_new', arguments: {} });
  await boardPage.evaluate(() => window.sendResult({ puzzleId: 'example-classic' }));
  await panel.getByRole('heading', { name: 'Example — classic', exact: true }).waitFor();

  assert.deepEqual(errors.filter(e => !/localStorage|Failed to read the 'localStorage'|SecurityError|sandbox/i.test(e)), [], 'no page errors');
  console.log('e2e ok: PWA (play, undo, notes, reload, hint, enter, SudokuPad import, offline, solve) and MCP App (handshake, result, report, zen keys and commands, library, live helper)');
} finally {
  await browser.close();
  http.close();
  await mcp.close();
}
