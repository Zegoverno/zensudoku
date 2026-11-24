// A Sudoku game's state and what the player can do to it: values, corner and center notes, colors,
// undo/redo and per-puzzle progress; plus saving and validated restore. Pure functions over a
// plain object (ui/state.svelte.ts makes it reactive), so tests need no DOM.
// Selection follows SudokuPad: `selected` is the cursor (peer highlighting, single-cell edits) and `selection`
// the cells every action applies to; it always holds the cursor. With more than one cell selected a digit in
// Value mode writes corner marks instead (the saved mode is untouched). Each action is one undo step.
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

/** A bit per number 1–9 (bit n−1) in `corner` and `center`; `colors` 0 is none, 1–6 index COLORS.
 *  `selection` lists the selected cells, `selected` (the cursor) among them. */
export interface Board { cells: number[]; corner: number[]; center: number[]; colors: number[]; selected: number; selection: number[]; play: PlayTime }
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
  const selected = activeCells(p)[0] ?? 0;
  return { cells: [...p.givens], corner: Array(sizeOf(p)).fill(0), center: Array(sizeOf(p)).fill(0), colors: Array(sizeOf(p)).fill(0), selected, selection: [selected], play: newPlayTime() };
}
const isBlank = (b: Pick<Board, 'cells' | 'corner' | 'center' | 'colors'>, p: Puzzle) => b.cells.every((n, i) => n === p.givens[i]) && !b.corner.some(Boolean) && !b.center.some(Boolean) && !b.colors.some(Boolean);

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

/** Selects only cell `i`. */
export function select(g: Game, i: number): boolean {
  if (!isActive(puzzleOf(g), i)) return false;
  const b = boardOf(g);
  b.selected = i; b.selection = [i];
  return true;
}
/** Adds cell `i` to the selection and moves the cursor there; false when nothing changed. */
export function addToSelection(g: Game, i: number): boolean {
  const b = boardOf(g);
  if (!isActive(puzzleOf(g), i) || (b.selected === i && b.selection.includes(i))) return false;
  if (!b.selection.includes(i)) b.selection.push(i);
  b.selected = i;
  return true;
}
/** Ctrl/Cmd+click: drops a selected cell (the cursor moves to the last one left; the last cell stays), else adds it. */
export function toggleSelection(g: Game, i: number): boolean {
  const b = boardOf(g);
  if (!b.selection.includes(i) || b.selection.length === 1) return addToSelection(g, i);
  b.selection = b.selection.filter(j => j !== i);
  b.selected = b.selection[b.selection.length - 1];
  return true;
}
/** Every empty, non-given cell (Ctrl+A); the cursor moves to the first one unless it is among them. False when there are none. */
export function selectAll(g: Game): boolean {
  const p = puzzleOf(g), b = boardOf(g), all = activeCells(p).filter(i => !p.givens[i] && !b.cells[i]);
  if (!all.length) return false;
  b.selection = all;
  if (!all.includes(b.selected)) b.selected = all[0];
  return true;
}
/** Value mode becomes Corner while several cells are selected; the saved `mode` is not touched. */
export function effectiveMode(g: Game): Mode { return g.mode === 'value' && peekBoard(g).selection.length > 1 ? 'corner' : g.mode; }
/** The selected cells that take notes: empty and not given (nothing once the board is done). */
export function noteCells(g: Game): number[] {
  const p = puzzleOf(g), b = peekBoard(g);
  return isDone(g) ? [] : b.selection.filter(i => !p.givens[i] && !b.cells[i]);
}
/** Whether every note-taking selected cell has note `n` of this kind (what the number pad shows as on). */
export function hasNoteOnAll(g: Game, kind: 'corner' | 'center', n: number): boolean {
  const b = peekBoard(g), cells = noteCells(g);
  return cells.length > 0 && cells.every(i => ((kind === 'corner' ? b.corner : b.center)[i] & bit(n)) !== 0);
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
/** Toggles a note across the selection: when every empty, non-given selected cell has it, it leaves them all; else it goes on all. */
export function toggleNote(g: Game, kind: 'corner' | 'center', n: number): boolean {
  if (!(Number.isInteger(n) && n >= 1 && n <= digitsOf(puzzleOf(g)))) return false;
  const b = boardOf(g), cells = noteCells(g), off = hasNoteOnAll(g, kind, n);
  return commit(g, cells.map(i => {
    const mask = kind === 'corner' ? b.corner[i] : b.center[i], next = off ? mask & ~bit(n) : mask | bit(n);
    return { i, to: kind === 'corner' ? { c: next } : { m: next } };
  }));
}
/** Enters `n` in the effective mode: a value in the cursor cell, or a note across the selection. */
export function enter(g: Game, n: number): boolean {
  const mode = effectiveMode(g);
  return mode === 'value' ? place(g, n) : toggleNote(g, mode, n);
}
/** Per selected cell: clears the value; with none, the notes; with none, the color. A given only loses its color. */
export function erase(g: Game): boolean {
  const p = puzzleOf(g), b = boardOf(g), done = isDone(g);
  return commit(g, b.selection.flatMap((i): { i: number; to: Partial<CellState> }[] => {
    const s = cellState(b, i);
    if (p.givens[i]) return [{ i, to: { k: 0 } }];
    if (done) return [];
    return [{ i, to: s.v ? { v: 0 } : s.c || s.m ? { c: 0, m: 0 } : { k: 0 } }];
  }));
}
/** Colors the selection; when every selected cell already has color `k` it is cleared from them all. 0 clears. */
export function setColor(g: Game, k: number): boolean {
  if (!Number.isInteger(k) || k < 0 || k > COLORS.length) return false;
  const b = boardOf(g), off = b.selection.every(i => b.colors[i] === k);
  return commit(g, b.selection.map(i => ({ i, to: { k: off ? 0 : k } })));
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
  b.selected = step[0].i; b.selection = [b.selected];
  return true;
}
export function redo(g: Game): boolean {
  const h = historyOf(g), step = h.redo.pop(), b = boardOf(g);
  if (!step) return false;
  for (const e of step) write(b, e.i, e.after);
  h.undo.push(step);
  b.selected = step[0].i; b.selection = [b.selected];
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
  // An old save has no selection; a bad one is trimmed to active, distinct cells, and always holds the cursor.
  const picked: unknown[] = Array.isArray(x.selection) ? x.selection.slice(0, sizeOf(p)) : [];
  const selection = [...new Set(picked.filter((i): i is number => Number.isInteger(i) && isActive(p, i as number)))];
  if (!selection.includes(x.selected)) selection.unshift(x.selected);
  const b = { cells: [...x.cells], corner: [...x.corner], center: [...x.center], colors: [...x.colors], selected: x.selected, selection };
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
