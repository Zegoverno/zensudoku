// The server's memory of the open game: the puzzle and the board the UI last reported (or the
// givens, when nothing has been reported). One session per server process; a host that runs the
// plugin per conversation gets one game per conversation.
import { CATALOG, customPuzzle, findPuzzle, gridText } from '../core/sudoku.ts';
import type { Puzzle } from '../core/sudoku.ts';
import { sizeOf } from '../core/sudoku-extra.ts';

export interface Session { puzzle: Puzzle; cells: number[]; selected: number }

let current: Session | null = null;

/** The open game; the bundled example, fresh, when none is open yet (a view may be mounted without a tool call). */
export function open(): Session {
  return current ??= { puzzle: CATALOG[0], cells: [...CATALOG[0].givens], selected: 0 };
}

/** Opens a puzzle: the bundled example, or the given 81 characters (checked for exactly one solution). */
export function start(text?: string): Session | string {
  if (text === undefined || !text.trim()) { current = { puzzle: CATALOG[0], cells: [...CATALOG[0].givens], selected: 0 }; return current; }
  const p = customPuzzle(text);
  if (typeof p === 'string') return p;
  current = { puzzle: p, cells: [...p.givens], selected: 0 };
  return current;
}

/** What the UI reports after each change. A string says why it was refused; the game is left as it was. */
export function report(puzzleId: string, cells: string, selected: number): Session | string {
  const puzzle = findPuzzle(puzzleId);
  if (!puzzle) return 'Unknown puzzle.';
  if (cells.length !== sizeOf(puzzle) || !/^[0-9.]+$/.test(cells)) return 'The board must be one character per cell: a digit, or . for empty.';
  const parsed = [...cells].map(ch => (ch === '.' ? 0 : Number(ch)));
  if (puzzle.givens.some((n, i) => n && parsed[i] !== n)) return 'The board changes a given.';
  current = { puzzle, cells: parsed, selected: Number.isInteger(selected) && selected >= 0 && selected < parsed.length ? selected : 0 };
  return current;
}

export const text = (cells: number[]) => gridText(cells);
