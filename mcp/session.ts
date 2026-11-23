// The server's memory of the open game: the puzzle and the board the UI last reported (or the
// givens, when nothing has been reported). One session per server process; a host that runs the
// plugin per conversation gets one game per conversation. Library puzzles (`lib-<id>`) are read
// from the local library when first needed; a SudokuPad source given to zensudoku_new is kept for
// the life of the process.
import { CATALOG, LIBRARY_PREFIX, customPuzzle, findPuzzle as findKnown, gridText, padPuzzle } from '../core/sudoku.ts';
import type { Puzzle } from '../core/sudoku.ts';
import { sizeOf } from '../core/sudoku-extra.ts';
import { libraryEntry } from './library.ts';
import type { LibraryEntry } from './library.ts';

export interface Session { puzzle: Puzzle; cells: number[]; selected: number; source?: string }

let current: Session | null = null;
const sources = new Map<string, string>();

// A change counter for views that follow the game (the Sudoku helper): it goes up whenever the open puzzle,
// its board or the selected cell changes, and wakes whoever waits for a change.
let version = 0;
const waiters = new Set<() => void>();
function changed() {
  version++;
  for (const wake of [...waiters]) wake();
}
/** The change counter now. */
export const versionNow = () => version;
/** Resolves when the counter differs from `since`, or after `ms` (at once when it already differs). */
export function waitForChange(since: number, ms: number): Promise<void> {
  if (since !== version || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    waiters.add(done);
  });
}

/** The library entry's puzzle, or why it cannot be opened. */
export function libraryPuzzle(entry: LibraryEntry): Puzzle | string {
  const { id, collection, number, title, author, video } = entry;
  const p = padPuzzle(entry.source, { id, collection, number, title, author, video });
  if (typeof p !== 'string') sources.set(p.id, entry.source);
  return p;
}

/** Any puzzle the server can open: the catalog, an entered classic, a SudokuPad source it was given, or the library. */
export function findPuzzle(id: string): Puzzle | null {
  const known = findKnown(id);
  if (known) return known;
  if (!id.startsWith(LIBRARY_PREFIX)) return null;
  const entry = libraryEntry(id.slice(LIBRARY_PREFIX.length));
  const p = entry && libraryPuzzle(entry);
  return p && typeof p !== 'string' ? p : null;
}
/** The SudokuPad source behind a puzzle id, when there is one. */
export const sourceOf = (id: string): string | undefined => { if (!sources.has(id)) findPuzzle(id); return sources.get(id); };

function begin(puzzle: Puzzle): Session {
  current = { puzzle, cells: [...puzzle.givens], selected: puzzle.pad ? puzzle.pad.active[0] ?? 0 : 0, source: sources.get(puzzle.id) };
  changed();
  return current;
}

/** The open game; the bundled example, fresh, when none is open yet (a view may be mounted without a tool call). */
export function open(): Session {
  return current ??= { puzzle: CATALOG[0], cells: [...CATALOG[0].givens], selected: 0 };
}

/** A SudokuPad source rather than 81 characters: it starts with scl, ctc, fpuz, { or a link. */
export const isSource = (text: string) => /^\s*(scl|ctc|fpuz|\{|https?:)/.test(text);

/** Opens a puzzle: the bundled example, the given 81 characters (checked for exactly one solution), or a SudokuPad source. */
export function start(text?: string): Session | string {
  if (text === undefined || !text.trim()) return begin(CATALOG[0]);
  if (isSource(text)) {
    const p = padPuzzle(text);
    if (typeof p === 'string') return p;
    sources.set(p.id, text.trim());
    return begin(p);
  }
  const p = customPuzzle(text);
  if (typeof p === 'string') return p;
  return begin(p);
}

/** Opens a library puzzle by its library id. */
export function openLibrary(id: string): Session | string {
  const entry = libraryEntry(id);
  if (!entry) return `No puzzle "${id}" in the library.`;
  const p = libraryPuzzle(entry);
  return typeof p === 'string' ? `"${id}" cannot be played: ${p}` : begin(p);
}

/** What the UI reports after each change. A string says why it was refused; the game is left as it was. */
export function report(puzzleId: string, cells: string, selected: number): Session | string {
  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) return 'Unknown puzzle.';
  if (cells.length !== sizeOf(puzzle) || !/^[0-9.]+$/.test(cells)) return 'The board must be one character per cell: a digit, or . for empty.';
  const parsed = [...cells].map(ch => (ch === '.' ? 0 : Number(ch)));
  if (puzzle.givens.some((n, i) => n && parsed[i] !== n)) return 'The board changes a given.';
  const sel = Number.isInteger(selected) && selected >= 0 && selected < parsed.length ? selected : 0;
  const same = current && current.puzzle.id === puzzle.id && current.selected === sel && gridText(current.cells) === gridText(parsed);
  current = { puzzle, cells: parsed, selected: sel, source: sources.get(puzzle.id) };
  if (!same) changed();
  return current;
}

export const text = (cells: number[]) => gridText(cells);
