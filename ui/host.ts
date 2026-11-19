// The MCP App entry: the same Sudoku UI inside a host (zenbot, Claude, ChatGPT, …).
// Built as one HTML file (vite.app.config.ts) and served by mcp/ as ui://zensudoku/app.
//
// - A tool result from the agent (zensudoku_new) opens that puzzle.
// - Every change is reported to this server (zensudoku_report, app-only) and to the chat's model
//   context (updateModelContext), so zensudoku_state and the agent see the board the player sees.
// - The host's theme, CSS variables and container size are followed live. zenbot's own context
//   (zen: pane, phone, slot, headingFont) is read when present and ignored when not (host-state.svelte.ts);
//   with it, zenbot draws the title and the close ×, so the app draws none.
// - Progress is saved in the iframe's localStorage when the sandbox allows it, else kept in memory.
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { mount } from 'svelte';
import './app.css';
import Sudoku from './Sudoku.svelte';
import { browserStorage } from './adapters.ts';
import type { Snapshot } from './adapters.ts';
import { createStore } from './state.svelte.ts';
import { host, readHost } from './host-state.svelte.ts';
import { choose } from '../core/sudoku-game.ts';
import { renderGrid, conflictList } from '../core/text.ts';
import { findPuzzle } from '../core/sudoku.ts';

const app = new App({ name: 'zensudoku', version: '0.2.0' });
const store = createStore(browserStorage());

/** Follows the host's theme, CSS variables and size, and records where zenbot shows us. */
function applyContext(ctx: ReturnType<App['getHostContext']>) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  readHost(ctx);
  const root = document.documentElement;
  if (host.slot) root.dataset.slot = host.slot; else delete root.dataset.slot;
  if (host.pane) root.dataset.pane = host.pane; else delete root.dataset.pane;
  if (host.zen) root.dataset.zen = ''; else delete root.dataset.zen;
  if (host.headingFont) root.style.setProperty('--heading-font', host.headingFont); else root.style.removeProperty('--heading-font');
}

let last = '', timer: ReturnType<typeof setTimeout> | undefined;
function report(s: Snapshot) {
  const key = `${s.puzzleId}|${s.cells}`;
  if (key === last) return;
  last = key;
  clearTimeout(timer);
  timer = setTimeout(() => {
    app.callServerTool({ name: 'zensudoku_report', arguments: { puzzleId: s.puzzleId, cells: s.cells, selected: s.selected } }).catch(() => {});
    const p = findPuzzle(s.puzzleId);
    if (!p) return;
    const cells = [...s.cells].map(ch => (ch === '.' ? 0 : Number(ch)));
    const bad = conflictList(p, cells);
    const text = `Sudoku "${s.name}" as the player sees it (. is empty):\n${renderGrid(p, cells)}\n${bad.length ? 'Conflicts: ' + bad.map(c => c.message).join(' ') : 'No conflicts.'}`;
    app.updateModelContext({ content: [{ type: 'text', text }] }).catch(() => {});
  }, 400);
}

app.ontoolresult = result => {
  const sc = result.structuredContent as { puzzleId?: unknown } | undefined;
  if (typeof sc?.puzzleId === 'string' && choose(store.game, sc.puzzleId)) store.save();
};
app.onhostcontextchanged = () => applyContext(app.getHostContext());

mount(Sudoku, { target: document.getElementById('app')!, props: { store, onchange: report, host } });
app.connect().then(() => applyContext(app.getHostContext()));
