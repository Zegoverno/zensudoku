// The Sudoku MCP server: six tools for an agent, two for the app, and the app's HTML resource.
//
//   zensudoku_new      open the example, a classic puzzle or a SudokuPad source; shows the board UI
//   zensudoku_library  the puzzles in the local library ($ZEN_PLUGIN_DATA/library)
//   zensudoku_open     open a library puzzle; shows the board UI
//   zensudoku_state    the board now, as text, with conflicts
//   zensudoku_check    conflicts, whether it is solved, how many entries are wrong
//   zensudoku_hint     one next logical step (a naked or hidden single), explained; never the solution
//   zensudoku_report   the UI tells the server its board (visible to the app only)
//   zensudoku_puzzle   the UI asks for a SudokuPad puzzle's source by id (visible to the app only)
//
// The UI keeps the server and the chat in sync (host.ts), so state/check/hint see what the player sees.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { verdict, wrongEntries } from '../core/sudoku.ts';
import { MAX_SOURCE } from '../core/sudokupad.ts';
import { hint } from '../core/hint.ts';
import { activeCells, coord } from '../core/sudoku-extra.ts';
import { conflictList, renderGrid } from '../core/text.ts';
import { findPuzzle, open, openLibrary, report, sourceOf, start, text } from './session.ts';
import type { Session } from './session.ts';
import { readLibrary } from './library.ts';

export const UI_URI = 'ui://zensudoku/app';

const reply = (message: string, structured: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: message }], structuredContent: structured });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

function describe(s: Session) {
  const { puzzle, cells } = s;
  const bad = conflictList(puzzle, cells);
  const active = activeCells(puzzle);
  const filled = active.filter(i => cells[i]).length;
  const v = verdict(cells, puzzle), pad = puzzle.pad;
  return {
    puzzleId: puzzle.id, name: puzzle.name, variant: puzzle.variant,
    grid: renderGrid(puzzle, cells), cells: text(cells), givens: text(puzzle.givens),
    filled, empty: active.length - filled, conflicts: bad, solved: v === 'solved',
    ...(pad ? { title: pad.title, author: pad.author, rules: pad.rules.join('\n\n'), video: pad.video || undefined, digits: pad.digits, rows: pad.rows, cols: pad.cols, checkable: !!pad.solution || pad.classic, full: v === 'full' } : {}),
  };
}
const FULL = 'Board full, no repeats. The variant rules can\'t be checked here: compare with the solution video.';
const summary = (d: ReturnType<typeof describe>) =>
  `${d.grid}\n${d.solved ? 'Solved.' : d.full ? FULL : `${d.filled} of ${d.filled + d.empty} cells filled.`} ${d.conflicts.length ? 'Conflicts: ' + d.conflicts.map(c => c.message).join(' ') : 'No conflicts.'}`;
const rulesText = (d: ReturnType<typeof describe>) => d.rules ? `\nBy ${d.author || 'an unknown author'}. Rules: ${d.rules}` : '';

/** `loadHtml` returns the built UI; the default reads ui/dist/index.html next to this server's build. */
export function createServer(loadHtml: () => string = defaultHtml): McpServer {
  const server = new McpServer({ name: 'zensudoku', version: '0.4.0' });

  registerAppResource(server, 'Sudoku board', UI_URI, {
    description: 'The Sudoku board: notes, colors, undo, hints.',
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  }, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: loadHtml(), _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } }],
  }));

  registerAppTool(server, 'zensudoku_new', {
    title: 'New Sudoku',
    description: 'Open a Sudoku and show the board. With no argument it opens the bundled example puzzle; with `puzzle` it opens that classic puzzle (81 characters, row by row: digits 1–9, "." or 0 for a blank; it must have exactly one solution) or a SudokuPad puzzle source (what sudokupad.app/api/puzzle/<id> returns: it starts with scl, ctc, fpuz or {).',
    inputSchema: { puzzle: z.string().max(MAX_SOURCE).optional().describe('81 characters, row by row (digits 1–9 and . or 0 for blank), or a SudokuPad source. Omit for the example.') },
    annotations: { readOnlyHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  }, async ({ puzzle }) => {
    const s = start(puzzle);
    if (typeof s === 'string') return fail(s);
    const d = describe(s);
    return reply(`Sudoku "${d.name}" is open.${rulesText(d)}\n${summary(d)}\nThe board is shown to the player; use zensudoku_hint for a next step and zensudoku_check to verify.`, d);
  });

  server.registerTool('zensudoku_library', {
    title: 'Sudoku library',
    description: 'The SudokuPad puzzles in the local library (the plugin\'s data folder, library/): id, collection, number, title and author, sorted by collection and number. `query` keeps those whose number, title, author or id contains it. Open one with zensudoku_open.',
    inputSchema: { query: z.string().max(100).optional().describe('Part of a number, title, author or id; omit for all.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query }) => {
    const lib = readLibrary();
    if (!lib.available) return reply('The library is empty here: this host gives the plugin no data folder (ZEN_PLUGIN_DATA), so there is no local library. Open a puzzle with zensudoku_new instead.', { available: false, count: 0, errors: 0, entries: [] });
    const q = (query ?? '').trim().toLowerCase();
    const entries = lib.entries.filter(e => !q || [e.id, e.number, e.title, e.author].some(s => s?.toLowerCase().includes(q)))
      .map(({ id, collection, number, title, author }) => ({ id, collection, number, title, author }));
    const lines = entries.map(e => `${e.id}: ${[e.number, e.title].filter(Boolean).join(' · ') || e.id}${e.author ? ` (${e.author})` : ''}${e.collection ? ` [${e.collection}]` : ''}`);
    const head = lib.entries.length ? `${entries.length} of ${lib.entries.length} puzzle(s) in the library.` : 'The library is empty: put SudokuPad puzzles (.json or .txt) in the plugin\'s data folder, under library/.';
    const errs = lib.errors.length ? `\n${lib.errors.length} file(s) could not be read: ${lib.errors.slice(0, 10).join('; ')}${lib.errors.length > 10 ? '; …' : ''}` : '';
    return reply(`${head}${errs}${lines.length ? '\n' + lines.join('\n') : ''}`, { available: true, count: entries.length, total: lib.entries.length, errors: lib.errors.length, errorList: lib.errors.slice(0, 50), entries });
  });

  registerAppTool(server, 'zensudoku_open', {
    title: 'Open a library Sudoku',
    description: 'Open a puzzle from the local library by its id (see zensudoku_library) and show the board, with its rules, title and author.',
    inputSchema: { id: z.string().max(100).describe('The library id, as zensudoku_library lists it.') },
    annotations: { readOnlyHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  }, async ({ id }) => {
    const s = openLibrary(id);
    if (typeof s === 'string') return fail(s);
    const d = describe(s);
    return reply(`Sudoku "${d.name}" is open.${rulesText(d)}\n${summary(d)}\nThe board is shown to the player; use zensudoku_check to verify.`, d);
  });

  server.registerTool('zensudoku_state', {
    title: 'Sudoku state',
    description: 'The current board as a text grid (. is empty) with any rule conflicts. It reflects what the player has entered in the UI.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => { const d = describe(open()); return reply(`"${d.name}"${rulesText(d)}\n${summary(d)}`, d); });

  server.registerTool('zensudoku_check', {
    title: 'Check the Sudoku',
    description: 'Whether the board has rule conflicts, whether it is solved, and how many entries do not match the solution (a count only; it never says which).',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const s = open(), d = describe(s);
    const wrong = wrongEntries(s.cells, s.puzzle);
    const verdict = d.solved ? 'Solved.' : d.full ? FULL : d.conflicts.length ? `${d.conflicts.length} conflict(s): ${d.conflicts.map(c => c.message).join(' ')}` : wrong ? `No rule conflicts, but ${wrong} ${wrong === 1 ? 'entry does' : 'entries do'} not match the solution.` : `No conflicts so far; ${d.empty} cell(s) left.`;
    return reply(verdict, { solved: d.solved, full: !!d.full, conflicts: d.conflicts, wrongEntries: wrong, empty: d.empty });
  });

  server.registerTool('zensudoku_hint', {
    title: 'Sudoku hint',
    description: 'One next logical step from the current board: a naked or hidden single, with the reason. It names the cell and digit for that one step only and never gives the rest of the solution. When no single exists it says so; when the board has a conflict or a wrong entry it says that first.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const s = open(), h = hint(s.puzzle, s.cells);
    const cell = h.cell === undefined ? undefined : coord(s.puzzle, h.cell);
    return reply(h.message, { kind: h.kind, cell, value: h.value, message: h.message });
  });

  registerAppTool(server, 'zensudoku_report', {
    title: 'Report the board',
    description: 'For the app only: the UI reports the board it shows so zensudoku_state, zensudoku_check and zensudoku_hint see it.',
    inputSchema: {
      puzzleId: z.string().max(120),
      cells: z.string().max(1000).describe('One character per cell: a digit, or . for empty.'),
      selected: z.number().int().min(0).max(999).optional(),
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['app'] } },
  }, async ({ puzzleId, cells, selected }) => {
    const s = report(puzzleId, cells, selected ?? 0);
    return typeof s === 'string' ? fail(s) : reply('ok', { ok: true });
  });

  registerAppTool(server, 'zensudoku_puzzle', {
    title: 'A SudokuPad puzzle',
    description: 'For the app only: the source of a SudokuPad puzzle the server knows (a library puzzle, or one opened with zensudoku_new), so the board can draw it.',
    inputSchema: { puzzleId: z.string().max(120) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['app'] } },
  }, async ({ puzzleId }) => {
    const p = findPuzzle(puzzleId), source = p && sourceOf(p.id);
    if (!p || !source) return fail('Unknown puzzle.');
    return reply('ok', { puzzleId: p.id, source, library: p.library ?? null });
  });

  return server;
}

function defaultHtml(): string {
  try { return readFileSync(new URL('../../ui/dist/index.html', import.meta.url), 'utf8'); }
  catch { throw new Error('The Sudoku UI is not built. Run `npm run build` in the plugin folder.'); }
}

