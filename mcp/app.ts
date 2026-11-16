// The Sudoku MCP server: four tools for an agent, one for the app, and the app's HTML resource.
//
//   zensudoku_new     open the example or a puzzle you give; shows the board UI
//   zensudoku_state   the board now, as text, with conflicts
//   zensudoku_check   conflicts, whether it is solved, how many entries are wrong
//   zensudoku_hint    one next logical step (a naked or hidden single), explained; never the solution
//   zensudoku_report  the UI tells the server its board (visible to the app only)
//
// The UI keeps the server and the chat in sync (host.ts), so state/check/hint see what the player sees.
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { complete } from '../core/sudoku.ts';
import { hint } from '../core/hint.ts';
import { activeCells } from '../core/sudoku-extra.ts';
import { conflictList, renderGrid } from '../core/text.ts';
import { open, report, start, text } from './session.ts';
import type { Session } from './session.ts';

export const UI_URI = 'ui://zensudoku/app';

const reply = (message: string, structured: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: message }], structuredContent: structured });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

function describe(s: Session) {
  const { puzzle, cells } = s;
  const bad = conflictList(puzzle, cells);
  const active = activeCells(puzzle);
  const filled = active.filter(i => cells[i]).length;
  return {
    puzzleId: puzzle.id, name: puzzle.name, variant: puzzle.variant,
    grid: renderGrid(puzzle, cells), cells: text(cells), givens: text(puzzle.givens),
    filled, empty: active.length - filled, conflicts: bad, solved: complete(cells, puzzle),
  };
}
const summary = (d: ReturnType<typeof describe>) =>
  `${d.grid}\n${d.solved ? 'Solved.' : `${d.filled} of ${d.filled + d.empty} cells filled.`} ${d.conflicts.length ? 'Conflicts: ' + d.conflicts.map(c => c.message).join(' ') : 'No conflicts.'}`;

/** `loadHtml` returns the built UI; the default reads ui/dist/index.html next to this server's build. */
export function createServer(loadHtml: () => string = defaultHtml): McpServer {
  const server = new McpServer({ name: 'zensudoku', version: '0.1.0' });

  registerAppResource(server, 'Sudoku board', UI_URI, {
    description: 'The Sudoku board: notes, colors, undo, hints.',
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  }, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: loadHtml(), _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } } }],
  }));

  registerAppTool(server, 'zensudoku_new', {
    title: 'New Sudoku',
    description: 'Open a Sudoku and show the board. With no argument it opens the bundled example puzzle; with `puzzle` it opens that classic puzzle (81 characters, row by row: digits 1–9, "." or 0 for a blank). A puzzle must have exactly one solution.',
    inputSchema: { puzzle: z.string().max(400).optional().describe('81 characters, row by row; digits 1–9 and . or 0 for blank. Omit for the example.') },
    annotations: { readOnlyHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } },
  }, async ({ puzzle }) => {
    const s = start(puzzle);
    if (typeof s === 'string') return fail(s);
    const d = describe(s);
    return reply(`Sudoku "${d.name}" is open.\n${summary(d)}\nThe board is shown to the player; use zensudoku_hint for a next step and zensudoku_check to verify.`, d);
  });

  server.registerTool('zensudoku_state', {
    title: 'Sudoku state',
    description: 'The current board as a text grid (. is empty) with any rule conflicts. It reflects what the player has entered in the UI.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => { const d = describe(open()); return reply(`"${d.name}"\n${summary(d)}`, d); });

  server.registerTool('zensudoku_check', {
    title: 'Check the Sudoku',
    description: 'Whether the board has rule conflicts, whether it is solved, and how many entries do not match the solution (a count only; it never says which).',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const s = open(), d = describe(s);
    const wrong = s.cells.filter((n, i) => n && !s.puzzle.givens[i] && n !== s.puzzle.solution[i]).length;
    const verdict = d.solved ? 'Solved.' : d.conflicts.length ? `${d.conflicts.length} conflict(s): ${d.conflicts.map(c => c.message).join(' ')}` : wrong ? `No rule conflicts, but ${wrong} ${wrong === 1 ? 'entry does' : 'entries do'} not match the solution.` : `No conflicts so far; ${d.empty} cell(s) left.`;
    return reply(verdict, { solved: d.solved, conflicts: d.conflicts, wrongEntries: wrong, empty: d.empty });
  });

  server.registerTool('zensudoku_hint', {
    title: 'Sudoku hint',
    description: 'One next logical step from the current board: a naked or hidden single, with the reason. It names the cell and digit for that one step only and never gives the rest of the solution. When no single exists it says so; when the board has a conflict or a wrong entry it says that first.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const s = open(), h = hint(s.puzzle, s.cells);
    const cell = h.cell === undefined ? undefined : `R${Math.floor(h.cell / Math.sqrt(s.cells.length)) + 1}C${(h.cell % Math.sqrt(s.cells.length)) + 1}`;
    return reply(h.message, { kind: h.kind, cell, value: h.value, message: h.message });
  });

  registerAppTool(server, 'zensudoku_report', {
    title: 'Report the board',
    description: 'For the app only: the UI reports the board it shows so zensudoku_state, zensudoku_check and zensudoku_hint see it.',
    inputSchema: {
      puzzleId: z.string().max(120),
      cells: z.string().max(500).describe('One character per cell: a digit, or . for empty.'),
      selected: z.number().int().min(0).max(440).optional(),
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['app'] } },
  }, async ({ puzzleId, cells, selected }) => {
    const s = report(puzzleId, cells, selected ?? 0);
    return typeof s === 'string' ? fail(s) : reply('ok', { ok: true });
  });

  return server;
}

function defaultHtml(): string {
  try { return readFileSync(new URL('../../ui/dist/index.html', import.meta.url), 'utf8'); }
  catch { throw new Error('The Sudoku UI is not built. Run `npm run build` in the plugin folder.'); }
}

