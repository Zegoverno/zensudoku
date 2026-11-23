// The MCP App entry: the same Sudoku UI inside a host (zenbot, Claude, ChatGPT, …).
// Built as one HTML file (vite.app.config.ts) and served by mcp/ as ui://zensudoku/app.
//
// - A tool result from the agent (zensudoku_new, zensudoku_open) opens that puzzle; a SudokuPad puzzle the
//   board has not seen is fetched first (zensudoku_puzzle, app-only) and its source kept for restoring.
// - The Library picker lists the server's local library (zensudoku_library); the solution video opens
//   through the host (app.openLink).
// - Every change is reported to this server (zensudoku_report, app-only) and to the chat's model
//   context (updateModelContext), so zensudoku_state and the agent see the board the player sees.
// - The host's theme, CSS variables and container size are followed live. zenbot's own context
//   (zen: pane, phone, slot, headingFont) is read when present and ignored when not (host-state.svelte.ts);
//   with it, zenbot draws the title and the close ×, so the app draws none.
// - Under zenbot (its `zen` host context) the board also takes part in zenbot's keyboard model (zen-keys.ts):
//   it declares its commands (zen/commands), forwards the keys it does not use (zen/key), runs zen/command and
//   focuses the board on zen/focus. Elsewhere none of these notifications is sent.
// - Progress is saved in plugin data when available, with iframe localStorage or memory as fallback.
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { mount } from 'svelte';
import { z } from 'zod';
import './app.css';
import Sudoku from './Sudoku.svelte';
import { browserStorage, sourceStorage } from './adapters.ts';
import type { LibraryItem, LibrarySource, Snapshot, SourceEntry } from './adapters.ts';
import { createStore } from './state.svelte.ts';
import { host, readHost } from './host-state.svelte.ts';
import { choose } from '../core/sudoku-game.ts';
import { renderGrid, conflictList } from '../core/text.ts';
import { LIBRARY_PREFIX, PAD_PREFIX, findPuzzle, padPuzzle } from '../core/sudoku.ts';
import type { LibraryInfo } from '../core/sudoku.ts';
import { commandId, commandList, focused, keyPayload } from './zen-keys.ts';
import type { Avail } from './zen-keys.ts';

import { version } from '../plugin.json';

const app = new App({ name: 'zensudoku', version });
const target = document.getElementById('app')!;

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

// The SDK does not restrict custom notifications.
const zen = (method: string, params: unknown) => (app as unknown as { notification(n: { method: string; params: unknown }): Promise<void> }).notification({ method, params }).catch(() => {});
const notification = (method: string) => z.object({ method: z.literal(method), params: z.unknown().optional() });

type Structured = Record<string, unknown> | undefined;
const resume = (args: Record<string, unknown>) => app.callServerTool(
  { name: 'zensudoku_resume', arguments: args }, { timeout: 2500 },
).then(r => r.isError ? undefined : r.structuredContent as Structured, () => undefined);

// Listen before connecting: a host may deliver an explicit puzzle while the save is loading.
let requested: string | undefined;
let openRequested: ((id: string) => Promise<void>) | undefined;
app.ontoolresult = async result => {
  const id = result.structuredContent?.puzzleId;
  if (typeof id !== 'string') return;
  if (openRequested) await openRequested(id);
  else requested = id;
};

async function mountBoard() {
  const stored = await resume({});
  const storage = browserStorage(), sources = sourceStorage();
  const storedGame = typeof stored?.game === 'string' ? stored.game : null;
  const hydrated = new Map<string, SourceEntry>();
  if (storedGame && Array.isArray(stored?.sources)) {
    for (const e of stored.sources) {
      if (typeof e?.id === 'string' && typeof e.source === 'string') hydrated.set(e.id, e);
    }
  }
  const writer = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  let revision = 0, pendingSave: ReturnType<typeof resume> | undefined;
  const store = createStore({
    read: () => storedGame ?? storage.read(),
    write(game) {
      storage.write(game);
      // Never overwrite a server save from a frame whose startup read timed out.
      if (stored?.available !== true) return;
      const { puzzleId, boards } = JSON.parse(game);
      const entries = [...new Set([puzzleId, ...Object.keys(boards)])].filter(id => id.startsWith(PAD_PREFIX))
        .map(id => store.sources.get(id)).filter((e): e is SourceEntry => !!e).slice(0, 200)
        .map(({ id, source }) => ({ id, source }));
      pendingSave = resume({ save: { game, sources: entries, writer, revision: ++revision } });
    },
  }, {
    get: id => hydrated.get(id) ?? (storedGame && id.startsWith(LIBRARY_PREFIX) ? undefined : sources.get(id)),
    all: () => [...new Map([...sources.all().map(e => [e.id, e] as const), ...hydrated]).values()],
    add: e => { hydrated.set(e.id, e); sources.add(e); },
  });
  let last = '', lastModel = '', timer: ReturnType<typeof setTimeout> | undefined;
  function report(s: Snapshot) {
    const modelKey = `${s.puzzleId}|${s.cells}`;
    const key = `${modelKey}|${s.selected}`;
    if (key === last) return;
    last = key;
    clearTimeout(timer);
    timer = setTimeout(() => {
      app.callServerTool({ name: 'zensudoku_report', arguments: { puzzleId: s.puzzleId, cells: s.cells, selected: s.selected } }).catch(() => {});
      if (lastModel === modelKey) return;
      lastModel = modelKey;
      const p = findPuzzle(s.puzzleId);
      if (!p) return;
      const cells = [...s.cells].map(ch => (ch === '.' ? 0 : Number(ch)));
      const bad = conflictList(p, cells);
      const text = `Sudoku "${s.name}" as the player sees it (. is empty):\n${renderGrid(p, cells)}\n${bad.length ? 'Conflicts: ' + bad.map(c => c.message).join(' ') : 'No conflicts.'}`;
      app.updateModelContext({ content: [{ type: 'text', text }] }).catch(() => {});
    }, 400);
  }

  /** A SudokuPad puzzle's source from the server, registered and kept; a string says why not. */
  async function fetchSource(puzzleId: string): Promise<SourceEntry | string> {
    const r = await app.callServerTool({ name: 'zensudoku_puzzle', arguments: { puzzleId } }).catch(() => null);
    const sc = r?.structuredContent as Structured;
    if (!r || r.isError || typeof sc?.source !== 'string' || typeof sc.puzzleId !== 'string') return 'The puzzle could not be fetched.';
    const entry: SourceEntry = { id: sc.puzzleId, source: sc.source, library: (sc.library as LibraryInfo | null) ?? undefined };
    const p = padPuzzle(entry.source, entry.library);
    if (typeof p === 'string') return p;
    if (entry.id !== puzzleId || p.id !== puzzleId) return 'The puzzle could not be fetched.';
    store.sources.add(entry);
    return entry;
  }
  const library: LibrarySource = {
    async list() {
      const r = await app.callServerTool({ name: 'zensudoku_library', arguments: {} });
      const sc = r.structuredContent as Structured;
      if (r.isError || !sc) throw new Error('no library');
      const entries = (Array.isArray(sc.entries) ? sc.entries : []) as Omit<LibraryItem, 'puzzleId'>[];
      return { available: sc.available === true, errors: Number(sc.errors) || 0, entries: entries.map(e => ({ ...e, puzzleId: LIBRARY_PREFIX + e.id })) };
    },
    source: item => fetchSource(item.puzzleId),
  };

  let request = 0;
  openRequested = async id => {
    const mine = ++request;
    if (!findPuzzle(id) && typeof await fetchSource(id) === 'string') return;
    if (mine === request && choose(store.game, id)) store.save();
  };
  if (requested !== undefined) void openRequested(requested);
  app.onhostcontextchanged = () => { applyContext(app.getHostContext()); sendCommands(); };

  // ---- zenbot's keyboard model (only when the host is zenbot) ----
  let connected = false, avail: Avail | null = null, sent = '';
  function sendCommands() {
    if (!host.zen) sent = '';
    if (!connected || !host.zen || !avail) return;
    const params = { commands: commandList(avail) }, text = JSON.stringify(params);
    if (text === sent) return;
    sent = text;
    void zen('zen/commands', params);
  }
  app.setNotificationHandler(notification('zen/command'), n => { const id = commandId(n.params); if (id) view.run(id); });
  app.setNotificationHandler(notification('zen/focus'), n => { if (focused(n.params)) view.focusBoard(); });

  const view = mount(Sudoku, {
    target,
    props: {
      store, onchange: report, host, library,
      onlink: (url: string) => { void app.openLink({ url }).catch(() => {}); },
      oncommands: (a: Avail) => { avail = a; sendCommands(); },
      onkey: (e: KeyboardEvent, typing: boolean) => { void zen('zen/key', keyPayload(e, typing)); },
    },
  });
  app.onteardown = async () => {
    view.stopTimer();
    clearTimeout(timer);
    await pendingSave;
    return {};
  };
  connected = true;
  sendCommands();
}

app.connect().then(() => { applyContext(app.getHostContext()); return mountBoard(); });
