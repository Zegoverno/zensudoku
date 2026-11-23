// A Sudoku game's state and what the player can do to it: values, corner and center notes, colors,
// undo/redo and per-puzzle progress; plus saving and validated restore. Pure functions over a
// plain object (ui/state.svelte.ts makes it reactive), so tests need no DOM.
import { CATALOG, playVerdict, filtered, findPuzzle, nextPuzzle, DIFFICULTIES, VARIANTS } from './sudoku.ts';
import { finishAttempt, newPlayTime, restorePlayTime } from './play-time.ts';
import type { PlayTime } from './play-time.ts';
import type { Difficulty, Puzzle, Variant } from './sudoku.ts';
import { activeCells, digitsOf, geometryUnits, isActive, sizeOf } from './sudoku-extra.ts';

export type Mode = 'value' | 'corner' | 'center';
export const MODES: Mode[] = ['value', 'corner', 'center'];
export const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'] as const;
export const MAX_HISTORY = 500;
const MAX_BOARDS = 500;

/** A bit per number 1–9 (bit n−1) in `corner` and `center`; `colors` 0 is none, 1–6 index COLORS. */
export interface Board { cells: number[]; corner: number[]; center: number[]; colors: number[]; selected: number; play: PlayTime }
export interface CellState { v: number; c: number; m: number; k: number }
export interface Edit { i: number; before: CellState; after: CellState }
export interface History { undo: Edit[][]; redo: Edit[][] }
export interface Game {
  puzzleId: string;
  mode: Mode;
  variant: Variant | 'all';
  difficulty: Difficulty | 'all';
  /** Progress per puzzle, so browsing the catalog never loses a board. */
  boards: Record<string, Board>;
  /** Placing a digit removes it from the notes of the cells that see it (on by default). */
  autoClear: boolean;
  /** Not saved: lasts while the page is open. */
  history: Record<string, History>;
}

export const bit = (n: number) => 1 << (n - 1);
export const notesOf = (mask: number): number[] => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => mask & bit(n));

export function blankBoard(p: Puzzle): Board {
  return { cells: [...p.givens], corner: Array(sizeOf(p)).fill(0), center: Array(sizeOf(p)).fill(0), colors: Array(sizeOf(p)).fill(0), selected: activeCells(p)[0] ?? 0, play: newPlayTime() };
}
const isBlank = (b: Omit<Board, 'play'>, p: Puzzle) => b.cells.every((n, i) => n === p.givens[i]) && !b.corner.some(Boolean) && !b.center.some(Boolean) && !b.colors.some(Boolean);

export function newGame(p: Puzzle = CATALOG[0]): Game {
  return { puzzleId: p.id, mode: 'value', variant: 'all', difficulty: 'all', autoClear: true, boards: { [p.id]: blankBoard(p) }, history: {} };
}
export const puzzleOf = (g: Game): Puzzle => findPuzzle(g.puzzleId) ?? CATALOG[0];
export function boardOf(g: Game): Board {
  const p = puzzleOf(g);
  return g.boards[p.id] ??= blankBoard(p);
}
/** The open board without creating it (safe where state must not change, such as a derived value). */
export const peekBoard = (g: Game): Board => g.boards[puzzleOf(g).id] ?? blankBoard(puzzleOf(g));
export const isDone = (g: Game) => {
  const b = peekBoard(g);
  return b.play.finished || playVerdict(b.cells, puzzleOf(g)) === 'solved';
};
/** A confirmation is accepted only for a board the validator cannot fully check. */
export function completeAttempt(g: Game, confirmed = false): boolean {
  const b = boardOf(g), result = playVerdict(b.cells, puzzleOf(g));
  if (result !== 'solved' && !(confirmed && result === 'full')) return false;
  if (!finishAttempt(b.play)) return false;
  delete g.history[g.puzzleId];
  return true;
}
/** New timed attempt from the givens. A previous solution and best time are kept. */
export function restart(g: Game): void {
  const p = puzzleOf(g), { solved, bestMs } = boardOf(g).play;
  const b = blankBoard(p);
  Object.assign(b.play, { solved, bestMs });
  g.boards[p.id] = b;
  delete g.history[p.id];
}

const cellState = (b: Board, i: number): CellState => ({ v: b.cells[i], c: b.corner[i], m: b.center[i], k: b.colors[i] });
const same = (a: CellState, b: CellState) => a.v === b.v && a.c === b.c && a.m === b.m && a.k === b.k;
function write(b: Board, i: number, s: CellState) { b.cells[i] = s.v; b.corner[i] = s.c; b.center[i] = s.m; b.colors[i] = s.k; }
function historyOf(g: Game): History { return g.history[g.puzzleId] ??= { undo: [], redo: [] }; }
/** Applies one undoable change; edits that change nothing are dropped. */
function commit(g: Game, changes: { i: number; to: Partial<CellState> }[]): boolean {
  const b = boardOf(g), edits: Edit[] = [];
  for (const { i, to } of changes) {
    const before = cellState(b, i), after = { ...before, ...to };
    if (!same(before, after)) edits.push({ i, before, after });
  }
  if (!edits.length) return false;
  for (const e of edits) write(b, e.i, e.after);
  const h = historyOf(g);
  h.undo.push(edits);
  if (h.undo.length > MAX_HISTORY) h.undo.shift();
  h.redo = [];
  return true;
}

export function select(g: Game, i: number): boolean {
  if (!isActive(puzzleOf(g), i)) return false;
  boardOf(g).selected = i;
  return true;
}
const editable = (g: Game) => { const p = puzzleOf(g), b = boardOf(g); return !p.givens[b.selected] && !isDone(g); };

/** The cells that see cell `i` under the basic rules: a row, column, box or region (or a diagonal, samurai
 *  grid, SudokuPad region) shared with it. Variant clues (cages, thermometers, dots…) do not count. */
export function seenBy(p: Puzzle, i: number): number[] {
  const out = new Set<number>();
  for (const u of geometryUnits(p)) if (u.cells.includes(i)) for (const j of u.cells) if (j !== i) out.add(j);
  return [...out].sort((a, b) => a - b);
}
/** Puts a number in the selected cell (its notes go); givens and a finished board are left alone. With
 *  `autoClear`, the number also leaves the corner and center notes of every cell that sees it, in the same undo step. */
export function place(g: Game, n: number): boolean {
  const p = puzzleOf(g);
  if (!(Number.isInteger(n) && n >= 1 && n <= digitsOf(p)) || !editable(g)) return false;
  const b = boardOf(g), i = b.selected, changes: { i: number; to: Partial<CellState> }[] = [{ i, to: { v: n, c: 0, m: 0 } }];
  if (g.autoClear && b.cells[i] !== n) {
    for (const j of seenBy(p, i)) if ((b.corner[j] | b.center[j]) & bit(n)) changes.push({ i: j, to: { c: b.corner[j] & ~bit(n), m: b.center[j] & ~bit(n) } });
  }
  return commit(g, changes);
}
/** Turns clearing notes on placement on or off. */
export function setAutoClear(g: Game, on: boolean): void { g.autoClear = on; }
/** Adds or removes a note; only an empty, non-given cell takes notes. */
export function toggleNote(g: Game, kind: 'corner' | 'center', n: number): boolean {
  const b = boardOf(g);
  if (!(Number.isInteger(n) && n >= 1 && n <= digitsOf(puzzleOf(g))) || !editable(g) || b.cells[b.selected]) return false;
  const mask = kind === 'corner' ? b.corner[b.selected] : b.center[b.selected];
  return commit(g, [{ i: b.selected, to: kind === 'corner' ? { c: mask ^ bit(n) } : { m: mask ^ bit(n) } }]);
}
/** Enters `n` in the current mode. */
export function enter(g: Game, n: number): boolean {
  return g.mode === 'value' ? place(g, n) : toggleNote(g, g.mode, n);
}
/** Clears the value; with none, the notes; with none, the color. A given only loses its color. */
export function erase(g: Game): boolean {
  const p = puzzleOf(g), b = boardOf(g), i = b.selected, s = cellState(b, i);
  if (p.givens[i]) return commit(g, [{ i, to: { k: 0 } }]);
  if (isDone(g)) return false;
  if (s.v) return commit(g, [{ i, to: { v: 0 } }]);
  if (s.c || s.m) return commit(g, [{ i, to: { c: 0, m: 0 } }]);
  return commit(g, [{ i, to: { k: 0 } }]);
}
export function setColor(g: Game, k: number): boolean {
  if (!Number.isInteger(k) || k < 0 || k > COLORS.length) return false;
  const b = boardOf(g);
  return commit(g, [{ i: b.selected, to: { k: b.colors[b.selected] === k ? 0 : k } }]);
}
/** Back to the givens: no entries, notes or colors (one undo brings them back). */
export function reset(g: Game): boolean {
  const p = puzzleOf(g);
  return commit(g, Array.from({ length: sizeOf(p) }, (_, i) => ({ i, to: { v: p.givens[i], c: 0, m: 0, k: 0 } })));
}
export function undo(g: Game): boolean {
  const h = historyOf(g), step = h.undo.pop(), b = boardOf(g);
  if (!step) return false;
  for (const e of [...step].reverse()) write(b, e.i, e.before);
  h.redo.push(step);
  b.selected = step[0].i;
  return true;
}
export function redo(g: Game): boolean {
  const h = historyOf(g), step = h.redo.pop(), b = boardOf(g);
  if (!step) return false;
  for (const e of step) write(b, e.i, e.after);
  h.undo.push(step);
  b.selected = step[0].i;
  return true;
}

// ---- the catalog ----
/** Opens a puzzle (its saved board, or a fresh one). */
export function choose(g: Game, id: string): boolean {
  const p = findPuzzle(id);
  if (!p) return false;
  g.puzzleId = p.id;
  boardOf(g);
  return true;
}
/** Sets the filters; if the open puzzle no longer matches, opens the first that does. */
export function setFilters(g: Game, variant: Variant | 'all', difficulty: Difficulty | 'all'): void {
  g.variant = variant; g.difficulty = difficulty;
  const list = filtered(variant, difficulty);
  if (list.length && !list.some(p => p.id === g.puzzleId)) choose(g, list[0].id);
}
/** The next puzzle matching the filters (wrapping); false when none other does. */
export function next(g: Game): boolean {
  const target = nextPuzzle(filtered(g.variant, g.difficulty), g.puzzleId);
  return !!target && target.id !== g.puzzleId && choose(g, target.id);
}

// ---- saving ----
export const STORAGE_KEY = 'zensudoku.v1';

export function serialize(g: Game): string {
  const boards: Record<string, Board> = {};
  for (const [id, b] of Object.entries(g.boards)) {
    const p = findPuzzle(id);
    if (p && (id === g.puzzleId || b.play.solved || b.play.elapsedMs || !isBlank(b, p))) boards[id] = b;
  }
  return JSON.stringify({ version: 1, puzzleId: g.puzzleId, mode: g.mode, variant: g.variant, difficulty: g.difficulty, autoClear: g.autoClear, boards });
}

const ints = (a: unknown, max: number, length: number): a is number[] =>
  Array.isArray(a) && a.length === length && a.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max);
/** A saved board for puzzle `p`, or null when it is not one: wrong shape, a changed given, notes under a number. */
function validBoard(x: any, p: Puzzle): Board | null {
  if (!x || typeof x !== 'object' || !ints(x.cells, digitsOf(p), sizeOf(p)) || !ints(x.corner, 511, sizeOf(p)) || !ints(x.center, 511, sizeOf(p)) ||
    !ints(x.colors, COLORS.length, sizeOf(p)) || !isActive(p, x.selected)) return null;
  for (let i = 0; i < sizeOf(p); i++) {
    if (!isActive(p,i) && (x.cells[i] || x.corner[i] || x.center[i] || x.colors[i])) return null;
    if (p.givens[i] && x.cells[i] !== p.givens[i]) return null;
    if (x.cells[i] && (x.corner[i] || x.center[i])) return null;
  }
  const b = { cells: [...x.cells], corner: [...x.corner], center: [...x.center], colors: [...x.colors], selected: x.selected };
  return { ...b, play: restorePlayTime(x.play, !isBlank(b, p), playVerdict(b.cells, p) === 'solved') };
}

/** A saved game. Null when the text is not one; boards that do not hold up are dropped, the rest kept. */
export function restore(raw: string | null): Game | null {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (!s || typeof s !== 'object' || s.version !== 1 || !s.boards || typeof s.boards !== 'object' || Array.isArray(s.boards)) return null;
    const boards: Record<string, Board> = {};
    for (const [id, x] of Object.entries(s.boards).slice(0, MAX_BOARDS)) {
      const p = findPuzzle(id), b = p && validBoard(x, p);
      if (p && b) boards[p.id] = b;
    }
    const g: Game = {
      puzzleId: '', boards, history: {},
      autoClear: s.autoClear !== false,
      mode: MODES.includes(s.mode) ? s.mode : 'value',
      variant: s.variant === 'all' || VARIANTS.includes(s.variant) ? s.variant : 'all',
      difficulty: s.difficulty === 'all' || DIFFICULTIES.includes(s.difficulty) ? s.difficulty : 'all',
    };
    const open = findPuzzle(s.puzzleId);
    if (open) g.puzzleId = open.id;
    else {
      // The catalog changed under the save: open the first saved puzzle, else the catalog's first.
      const first = Object.keys(boards)[0];
      const p = (first && findPuzzle(first)) || CATALOG[0];
      g.puzzleId = p.id;
    }
    boardOf(g);
    return g;
  } catch { return null; }
}

/** What to open: the save, else a new game. */
export const load = (raw: string | null): Game => restore(raw) ?? newGame();
