// Sudoku rules and the bundled catalog. Pure: no Svelte, no storage (sudoku-game.ts keeps the
// board, notes and history; sudoku-state.svelte.ts the reactive copy).
//
// The bundled catalog (core/catalog.json) holds puzzles our own generator made (scripts/). Each
// puzzle carries one variant's constraints. Jigsaw replaces boxes; Samurai shares five grids.
// Difficulty is a provisional per-puzzle rating, not a measurement. A classic puzzle the player
// types in has the id `custom-<81 digits>`: it is checked for exactly one solution before it is played.
// A SudokuPad puzzle (variant `sudokupad`, core/sudokupad.ts) is registered when it is opened, from the
// local library (`lib-<id>`) or an imported source (`pad-<hash>`); it brings its own grid, units and drawing.
import raw from './catalog.json';
import { digitsOf, extraClues, extraViolations, geometryUnits, isActive, parseExtra, sizeOf } from './sudoku-extra.ts';
import type { ExtraRules } from './sudoku-extra.ts';
import { parseSudokuPad, solveUnits } from './sudokupad.ts';

export type Variant = 'classic' | 'diagonal' | 'killer' | 'sandwich' | 'thermo' | 'consecutive' | 'nonconsecutive' | 'arrow' | 'renban' | 'kropki' | 'littlekiller' | 'jigsaw' | 'samurai' | 'sudokupad';
export type Difficulty = 'easy' | 'medium' | 'hard';
export const VARIANTS: Variant[] = ['classic', 'diagonal', 'killer', 'sandwich', 'thermo', 'consecutive', 'nonconsecutive', 'arrow', 'renban', 'kropki', 'littlekiller', 'jigsaw', 'samurai'];
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const VARIANT_LABEL: Record<Variant, string> = {
  classic: 'Classic', diagonal: 'Diagonal', killer: 'Killer', sandwich: 'Sandwich', thermo: 'Thermo',
  consecutive: 'Consecutive', nonconsecutive: 'Non-consecutive', arrow: 'Arrow', renban: 'Renban', kropki: 'Kropki', littlekiller: 'Little Killer', jigsaw: 'Jigsaw / Irregular', samurai: 'Samurai', sudokupad: 'SudokuPad',
};
export const VARIANT_RULE: Record<Variant, string> = {
  classic: 'One of each number in every row, column and box.',
  diagonal: 'Classic rules, and both long diagonals also hold one of each number.',
  killer: 'Classic rules. Numbers in a dashed cage never repeat and add up to the small number in its corner.',
  sandwich: 'Classic rules. A clue beside a row or column is the sum of the numbers between the 1 and the 9 in it.',
  thermo: 'Classic rules. Numbers strictly increase along each thermometer from the round bulb to the tip.',
  consecutive: 'Classic rules. A bar between two cells means their numbers differ by 1; no bar means they do not.',
  nonconsecutive: 'Classic rules. Cells that touch along a side never hold numbers that differ by 1.',
  arrow: 'Classic rules. Each circled digit equals the sum along its arrow. Shaft digits may repeat where Sudoku allows.',
  renban: 'Classic rules. Each purple line holds distinct consecutive digits, in any order.',
  kropki: 'Classic rules. White dots mean difference 1; black dots mean ratio 2. Unmarked pairs are unrestricted.',
  littlekiller: 'Classic rules. Each outside clue sums the indicated diagonal. Digits may repeat along a diagonal.',
  jigsaw: 'Each row, column and outlined irregular region holds 1–9. Irregular regions replace the usual boxes.',
  samurai: 'Five overlapping Sudoku grids. Each grid follows classic rules; overlapping cells share the same value and notes.',
  sudokupad: 'The rules are the puzzle\'s own (below). Rows, columns and regions are checked for repeats here.',
};

export interface Cage { sum: number; cells: number[] }
export interface Rules extends ExtraRules {
  variant: Variant;
  cages: Cage[];
  thermometers: number[][];
  rowSandwich: (number | null)[];
  colSandwich: (number | null)[];
  consecutive: [number, number][];
}
export interface Puzzle extends Rules {
  id: string;
  name: string;
  /** null: not rated (a puzzle carried over from the first Sudoku version). */
  difficulty: Difficulty | null;
  rating: string;
  givens: number[];
  /** The digit of each cell; for a SudokuPad puzzle 0 where it is not known (empty when there is no solution). */
  solution: number[];
  /** A SudokuPad puzzle's library entry: where it comes from. */
  library?: LibraryInfo;
}
/** What the local library says about a puzzle (core/library.ts reads it). */
export interface LibraryInfo { id: string; collection?: string; number?: string; title?: string; author?: string; video?: string; difficulty?: Difficulty; variants?: readonly Variant[]; tags?: readonly string[] }

const NO_LINES: (number | null)[] = Array(9).fill(null);
export const CLASSIC: Rules = { variant: 'classic', cages: [], thermometers: [], rowSandwich: NO_LINES, colSandwich: NO_LINES, consecutive: [] };

// ---- geometry ----
export const rc = (i: number): string => `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`;
const row = (r: number) => Array.from({ length: 9 }, (_, c) => r * 9 + c);
const col = (c: number) => Array.from({ length: 9 }, (_, r) => r * 9 + c);
export const adjacentPairs: [number, number][] = [];
for (let i = 0; i < 81; i++) {
  if (i % 9 < 8) adjacentPairs.push([i, i + 1]);
  if (i < 72) adjacentPairs.push([i, i + 9]);
}
const pairKey = (a: number, b: number) => (a < b ? a * 81 + b : b * 81 + a);
const isAdjacent = (a: number, b: number): boolean => { const lo = Math.min(a, b), hi = Math.max(a, b); return hi - lo === 9 || (hi - lo === 1 && lo % 9 < 8); };

// ---- rules ----
export type Rule = 'row' | 'column' | 'box' | 'diagonal' | 'cage' | 'sandwich' | 'thermo' | 'consecutive' | 'nonconsecutive' | 'arrow' | 'renban' | 'kropki' | 'littlekiller' | 'region' | 'shape';
export interface Violation { rule: Rule; cells: number[]; message: string }

interface Unit { rule: Rule; label: string; cells: number[] }
function units(p: Rules): Unit[] {
  const u: Unit[] = geometryUnits(p);
  for (const c of p.cages) u.push({ rule: 'cage', label: `the ${c.sum} cage at ${rc(Math.min(...c.cells))}`, cells: c.cells });
  return u;
}
const unitCache = new WeakMap<object, Unit[]>();
const unitsOf = (p: Rules) => { let u = unitCache.get(p); if (!u) unitCache.set(p, u = units(p)); return u; };

/** Can `k` more distinct numbers from `pool` bring `have` to exactly `target`? */
function reachable(have: number, k: number, pool: number[], target: number): boolean {
  if (k > pool.length) return false;
  const s = [...pool].sort((a, b) => a - b);
  const lo = s.slice(0, k).reduce((a, b) => a + b, 0), hi = s.slice(s.length - k).reduce((a, b) => a + b, 0);
  return have + lo <= target && have + hi >= target;
}

/** Every broken rule on the board; blanks never break anything on their own. */
export function violations(cells: number[], p: Rules = CLASSIC): Violation[] {
  const out: Violation[] = extraViolations(cells, p);
  for (const u of unitsOf(p)) {
    const seen = new Map<number, number[]>();
    for (const i of u.cells) if (cells[i]) seen.set(cells[i], [...(seen.get(cells[i]) ?? []), i]);
    for (const [n, at] of seen) if (at.length > 1) out.push({ rule: u.rule, cells: at, message: `${n} repeats in ${u.label}.` });
  }
  for (const c of p.cages) {
    const filled = c.cells.filter(i => cells[i]), have = filled.reduce((a, i) => a + cells[i], 0);
    if (new Set(filled.map(i => cells[i])).size < filled.length) continue; // the repeat is reported above
    const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !filled.some(i => cells[i] === n));
    if (!reachable(have, c.cells.length - filled.length, pool, c.sum))
      out.push({ rule: 'cage', cells: c.cells, message: `The cage at ${rc(Math.min(...c.cells))} cannot add up to ${c.sum}.` });
  }
  const lines: [string, number[][], (number | null)[]][] = [['row', Array.from({ length: 9 }, (_, k) => row(k)), p.rowSandwich], ['column', Array.from({ length: 9 }, (_, k) => col(k)), p.colSandwich]];
  for (const [name, all, clues] of lines) all.forEach((line, k) => {
    const s = clues[k];
    if (s == null) return;
    const ones = line.filter(i => cells[i] === 1), nines = line.filter(i => cells[i] === 9);
    if (ones.length !== 1 || nines.length !== 1) return;
    const a = line.indexOf(ones[0]), b = line.indexOf(nines[0]);
    const between = line.slice(Math.min(a, b) + 1, Math.max(a, b));
    const filled = between.filter(i => cells[i]);
    const pool = [2, 3, 4, 5, 6, 7, 8].filter(n => !line.some(i => cells[i] === n));
    if (!reachable(filled.reduce((x, i) => x + cells[i], 0), between.length - filled.length, pool, s))
      out.push({ rule: 'sandwich', cells: [ones[0], ...between, nines[0]], message: `The sandwich between the 1 and 9 in ${name} ${k + 1} cannot add up to ${s}.` });
  });
  for (const t of p.thermometers) for (let a = 0; a < t.length; a++) {
    const va = cells[t[a]];
    if (!va) continue;
    if (va < a + 1 || va > 9 - (t.length - 1 - a))
      out.push({ rule: 'thermo', cells: [t[a]], message: `${va} in ${rc(t[a])} leaves no room on its thermometer.` });
    for (let b = a + 1; b < t.length; b++) if (cells[t[b]] && cells[t[b]] - va < b - a)
      out.push({ rule: 'thermo', cells: [t[a], t[b]], message: `The thermometer must rise from ${rc(t[a])} to ${rc(t[b])}.` });
  }
  if (p.consecutive.length || p.variant === 'consecutive' || p.variant === 'nonconsecutive') {
    const marked = new Set(p.consecutive.map(([a, b]) => pairKey(a, b)));
    const negative = p.variant === 'consecutive' || p.variant === 'nonconsecutive';
    for (const [a, b] of adjacentPairs) {
      if (!cells[a] || !cells[b]) continue;
      const near = Math.abs(cells[a] - cells[b]) === 1;
      if (marked.has(pairKey(a, b)) && !near)
        out.push({ rule: 'consecutive', cells: [a, b], message: `${rc(a)} and ${rc(b)} are joined by a bar: they must differ by 1.` });
      else if (negative && !marked.has(pairKey(a, b)) && near)
        out.push({ rule: 'nonconsecutive', cells: [a, b], message: `${rc(a)} and ${rc(b)} touch without a bar: they must not differ by 1.` });
    }
  }
  return out;
}
export function conflicts(cells: number[], p: Rules = CLASSIC): Set<number> {
  return new Set(violations(cells, p).flatMap(v => v.cells));
}
/**
 * Where a board stands: `solved`; `full`, every cell filled with no repeat but the puzzle's own rules
 * cannot be checked here (a SudokuPad variant without a solution); or `open`.
 */
export type Verdict = 'solved' | 'full' | 'open';
export function verdict(cells: number[], p: Rules = CLASSIC): Verdict {
  if (cells.length !== sizeOf(p) || !cells.every(n => Number.isInteger(n))) return 'open';
  const pad = p.pad;
  if (pad?.solution) return activeCellsOf(p).every(i => pad.solution![i] < 0 || cells[i] === pad.solution![i]) ? 'solved' : 'open';
  const full = cells.every((n, i) => isActive(p, i) ? n >= 1 && n <= digitsOf(p) : n === 0) && violations(cells, p).length === 0;
  if (!full) return 'open';
  return !pad || pad.classic ? 'solved' : 'full';
}
const activeCellsOf = (p: Rules) => p.pad ? p.pad.active : Array.from({ length: sizeOf(p) }, (_, i) => i).filter(i => isActive(p, i));
export const complete = (cells: number[], p: Rules = CLASSIC) => verdict(cells, p) === 'solved';
// Play records require stronger evidence than a wildcard answer key or the
// SudokuPad classic-geometry heuristic when additional rules are written out.
export function playVerdict(cells: number[], p: Puzzle): Verdict {
  const result = verdict(cells, p), pad = p.pad;
  if (result !== 'solved' || !pad) return result;
  if (pad.solution) return pad.active.some(i => pad.solution![i] < 0) ? (verdict(cells, { ...p, pad: { ...pad, solution: null } }) === 'open' ? 'open' : 'full') : 'solved';
  return pad.rules.every(rule => /^(normal|standard|classic) sudoku rules apply\.?$/i.test(rule.trim())) ? 'solved' : 'full';
}
/** Entries that are not the solution's (a count; 0 when the solution is not known). A SudokuPad cell meant to stay empty counts too. */
export function wrongEntries(cells: number[], p: Puzzle): number {
  const sol = p.pad ? p.pad.solution : p.solution;
  if (!sol) return 0;
  return cells.filter((n, i) => n && !p.givens[i] && (p.pad ? sol[i] >= 0 && n !== sol[i] : n !== sol[i])).length;
}

/** Cells that share a unit (or a thermometer) with `a`, for the soft highlight. */
export function related(p: Rules, a: number, b: number): boolean {
  if (a === b) return false;
  return unitsOf(p).some(u => u.cells.includes(a) && u.cells.includes(b)) ||
    p.thermometers.some(t => t.includes(a) && t.includes(b)) ||
    (p.arrows ?? []).some(t => [t.circle,...t.cells].includes(a) && [t.circle,...t.cells].includes(b)) ||
    (p.renbans ?? []).some(t => t.includes(a) && t.includes(b)) || (p.littleKillers ?? []).some(t => t.cells.includes(a) && t.cells.includes(b));
}
/**
 * The chess rule that ties `b` to `a` when the puzzle has one, for a second highlight: 'knight' or
 * 'king' when `b` is that piece's move away from `a` (king wins when both apply), else null.
 */
export function chessRelated(p: Rules, a: number, b: number): 'knight' | 'king' | null {
  const chess = p.pad?.chess;
  if (!chess || a === b || (!chess.knight && !chess.king)) return null;
  const w = p.pad!.cols, dr = Math.abs(Math.floor(a / w) - Math.floor(b / w)), dc = Math.abs(a % w - b % w);
  if (chess.king && dr <= 1 && dc <= 1) return 'king';
  if (chess.knight && dr * dc === 2) return 'knight';
  return null;
}
/** Classic peers (row, column, box). */
export function peers(a: number, b: number): boolean {
  return Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 ||
    (Math.floor(a / 27) === Math.floor(b / 27) && Math.floor((a % 9) / 3) === Math.floor((b % 9) / 3));
}

// ---- clues as text (the accessible twin of the board's drawing) ----
export function clueList(p: Rules): { title: string; items: string[] }[] {
  const out: { title: string; items: string[] }[] = extraClues(p);
  if (p.variant === 'diagonal') out.push({ title: 'Diagonals', items: ['Main diagonal R1C1 to R9C9: one of each number.', 'Anti-diagonal R1C9 to R9C1: one of each number.'] });
  if (p.cages.length) out.push({ title: 'Cages', items: p.cages.map(c => `Sum ${c.sum}: ${[...c.cells].sort((a, b) => a - b).map(rc).join(', ')}`) });
  if (p.thermometers.length) out.push({ title: 'Thermometers (bulb to tip, rising)', items: p.thermometers.map(t => t.map(rc).join(' → ')) });
  const lines = (name: string, clues: (number | null)[]) => clues.flatMap((s, k) => s == null ? [] : [`${name} ${k + 1}: ${s}`]);
  const sandwich = [...lines('Row', p.rowSandwich), ...lines('Column', p.colSandwich)];
  if (sandwich.length) out.push({ title: 'Sandwich sums (between the 1 and the 9)', items: sandwich });
  if (p.variant === 'consecutive') out.push({ title: 'Consecutive bars', items: [...p.consecutive].map(([a, b]) => `${rc(a)} – ${rc(b)}`).concat(['Every other pair of touching cells must not differ by 1.']) });
  if (p.variant === 'nonconsecutive') out.push({ title: 'Touching cells', items: ['No two cells that share a side may differ by 1.'] });
  return out;
}

// ---- the catalog ----
function parsePuzzle(x: any): Puzzle | string {
  const bad = (why: string) => `${x?.id ?? '?'}: ${why}`;
  if (!x || typeof x !== 'object') return 'not an object';
  if (typeof x.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(x.id)) return bad('bad id');
  if (typeof x.name !== 'string' || !x.name.trim()) return bad('no name');
  if (!VARIANTS.includes(x.variant)) return bad('unknown variant');
  if (!DIFFICULTIES.includes(x.difficulty)) return bad('unknown difficulty');
  if (typeof x.rating !== 'string' || !x.rating.trim()) return bad('no rating');
  const shape = { variant: x.variant }, length = sizeOf(shape);
  const grid = (s: unknown, lo: number) => typeof s === 'string' && s.length === length && /^[0-9]+$/.test(s) && [...s].every((ch,i) => isActive(shape,i) ? Number(ch) >= lo : ch === '0') ? [...s].map(Number) : null;
  const givens = grid(x.givens, 0), solution = grid(x.solution, 1);
  if (!givens || !solution) return bad(`givens/solution must have ${length} digits with zeros in inactive spaces`);
  if (givens.some((n, i) => n && n !== solution[i])) return bad('a given contradicts the solution');
  const cellsOk = (a: unknown, min: number, max: number): a is number[] => Array.isArray(a) && a.length >= min && a.length <= max &&
    a.every(i => Number.isInteger(i) && i >= 0 && i < 81) && new Set(a).size === a.length;
  const list = (a: unknown): any[] => (Array.isArray(a) ? a : []);
  const cages: Cage[] = [];
  for (const c of list(x.cages)) {
    if (!c || !Number.isInteger(c.sum) || c.sum < 1 || c.sum > 45 || !cellsOk(c.cells, 1, 9)) return bad('bad cage');
    cages.push({ sum: c.sum, cells: [...c.cells] });
  }
  const thermometers: number[][] = [];
  for (const t of list(x.thermometers)) {
    if (!cellsOk(t, 2, 9) || t.some((v, k) => k && !isAdjacentOrDiagonal(t[k - 1], v))) return bad('bad thermometer');
    thermometers.push([...t]);
  }
  const sandwich = (a: unknown) => Array.isArray(a) && a.length === 9 && a.every(v => v === null || (Number.isInteger(v) && v >= 0 && v <= 35)) ? [...a] as (number | null)[] : null;
  const rowSandwich = x.rowSandwich === undefined ? NO_LINES : sandwich(x.rowSandwich), colSandwich = x.colSandwich === undefined ? NO_LINES : sandwich(x.colSandwich);
  if (!rowSandwich || !colSandwich) return bad('bad sandwich clues');
  const consecutive: [number, number][] = [];
  for (const q of list(x.consecutive)) {
    if (!Array.isArray(q) || q.length !== 2 || !cellsOk(q, 2, 2) || !isAdjacent(q[0], q[1])) return bad('bad consecutive pair');
    consecutive.push([q[0], q[1]]);
  }
  if (x.variant === 'samurai' && (cages.length || thermometers.length || consecutive.length || rowSandwich.some(v => v != null) || colSandwich.some(v => v != null))) return bad('Samurai cannot carry standard-grid-only clues');
  const extra = parseExtra(x); if (typeof extra === 'string') return bad(extra);
  const p: Puzzle = { ...extra, id: x.id, name: x.name.trim(), variant: x.variant, difficulty: x.difficulty, rating: x.rating.trim(), givens, solution, cages, thermometers, rowSandwich, colSandwich, consecutive };
  const needs: Partial<Record<Variant, boolean>> = { killer: cages.length > 0, thermo: thermometers.length > 0, sandwich: rowSandwich.some(v => v != null) || colSandwich.some(v => v != null) };
  if (needs[p.variant] === false) return bad(`a ${p.variant} puzzle needs its clues`);
  if (!complete(solution, p)) return bad('the stored solution breaks the rules');
  return p;
}
// A thermometer may step diagonally; a pair of bars may not.
const isAdjacentOrDiagonal = (a: number, b: number) => Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) <= 1 && Math.abs((a % 9) - (b % 9)) <= 1 && a !== b;

export function parseCatalog(data: unknown): { puzzles: Puzzle[]; errors: string[] } {
  const puzzles: Puzzle[] = [], errors: string[] = [];
  const list = (data as { version?: unknown; puzzles?: unknown } | null);
  if (!list || list.version !== 1 || !Array.isArray(list.puzzles)) return { puzzles, errors: ['catalog must be {version: 1, puzzles: [...]}'] };
  for (const x of list.puzzles) {
    const p = parsePuzzle(x);
    if (typeof p === 'string') errors.push(p);
    else if (puzzles.some(q => q.id === p.id)) errors.push(`${p.id}: duplicate id`);
    else puzzles.push(p);
  }
  return { puzzles, errors };
}
const parsed = parseCatalog(raw);
/** Rejected entries are left out of play rather than breaking the page; a test keeps this empty. */
export const CATALOG_ERRORS = parsed.errors;
export const CATALOG: Puzzle[] = parsed.puzzles;

/** The puzzles matching the filters, in catalog order. */
export function filtered(variant: Variant | 'all', difficulty: Difficulty | 'all', catalog: Puzzle[] = CATALOG): Puzzle[] {
  return catalog.filter(p => (variant === 'all' || p.variant === variant) && (difficulty === 'all' || p.difficulty === difficulty));
}
/** The next puzzle after `currentId` in the list, wrapping; the first when it is not in the list. */
export function nextPuzzle(list: Puzzle[], currentId: string): Puzzle | null {
  if (!list.length) return null;
  const at = list.findIndex(p => p.id === currentId);
  return list[(at + 1) % list.length];
}

// ---- entered puzzles (classic) ----
export const CUSTOM_PREFIX = 'custom-';
/** Node budget for checking an entered puzzle: a classic 9×9 never needs more than a few thousand. */
const SOLVE_BUDGET = 200_000;

/** An 81-character grid: digits 1–9, and 0 or . for a blank (spaces and line breaks are ignored). */
export function parseGrid(text: string): number[] | string {
  const s = text.replace(/\s+/g, '').replace(/[._-]/g, '0');
  if (!/^[0-9]*$/.test(s)) return 'Use only the digits 1–9 and . or 0 for a blank.';
  if (s.length !== 81) return `A classic puzzle has 81 cells; this has ${s.length}.`;
  return [...s].map(Number);
}
export const gridText = (cells: number[]): string => cells.map(n => n || '.').join('');

/** Counts classic solutions (up to `limit`) with bitmasks and the most-constrained cell first. */
export function solveClassic(givens: number[], limit = 2, budget = SOLVE_BUDGET): { count: number; solution: number[] | null; exhausted: boolean } {
  const cells = [...givens], rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
  const box = (i: number) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
  let nodes = 0, count = 0, solution: number[] | null = null, exhausted = false;
  for (let i = 0; i < 81; i++) {
    const n = cells[i];
    if (!n) continue;
    const b = 1 << n;
    if (rows[Math.floor(i / 9)] & b || cols[i % 9] & b || boxes[box(i)] & b) return { count: 0, solution: null, exhausted };
    rows[Math.floor(i / 9)] |= b; cols[i % 9] |= b; boxes[box(i)] |= b;
  }
  const ones = (m: number) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const search = () => {
    if (count >= limit || exhausted) return;
    if (++nodes > budget) { exhausted = true; return; }
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81 && bestCount > 1; i++) {
      if (cells[i]) continue;
      const free = 0x3fe & ~(rows[Math.floor(i / 9)] | cols[i % 9] | boxes[box(i)]), k = ones(free);
      if (k < bestCount) { best = i; bestMask = free; bestCount = k; if (k === 0) return; }
    }
    if (best < 0) { count++; solution ??= [...cells]; return; }
    const r = Math.floor(best / 9), c = best % 9, b = box(best);
    for (let n = 1; n <= 9; n++) {
      const bit = 1 << n;
      if (!(bestMask & bit)) continue;
      cells[best] = n; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      search();
      cells[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      if (count >= limit || exhausted) return;
    }
  };
  search();
  return { count, solution, exhausted };
}

const customCache = new Map<string, Puzzle | string>();
/** A classic puzzle from text. A string says why it cannot be played: shape, a repeat, none or many solutions. */
export function customPuzzle(text: string): Puzzle | string {
  const givens = parseGrid(text);
  if (typeof givens === 'string') return givens;
  if (givens.every(n => !n)) return 'The grid is empty.';
  const id = CUSTOM_PREFIX + givens.join('');
  const hit = customCache.get(id);
  if (hit) return hit;
  const found = solveClassic(givens);
  const made: Puzzle | string = found.exhausted ? 'This puzzle is too hard to check here.'
    : found.count === 0 ? 'This puzzle has no solution (a digit repeats, or the clues contradict).'
    : found.count > 1 ? 'This puzzle has more than one solution; a proper Sudoku has exactly one.'
    : { ...CLASSIC, id, name: 'Entered puzzle', difficulty: null, rating: 'Entered by you; not rated.', givens, solution: found.solution! };
  if (customCache.size > 1000) customCache.clear();
  customCache.set(id, made);
  return made;
}

// ---- SudokuPad puzzles ----
export const LIBRARY_PREFIX = 'lib-', PAD_PREFIX = 'pad-';
const registry = new Map<string, Puzzle>();
/** A short, stable id for an imported source. */
export function sourceId(source: string): string {
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < source.length; i++) { const c = source.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; }
  return PAD_PREFIX + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
/** A SudokuPad source as a puzzle, registered under `id` (by default from the source) so findPuzzle knows it. */
export function padPuzzle(source: string, library?: LibraryInfo): Puzzle | string {
  const id = library ? LIBRARY_PREFIX + library.id : sourceId(source.trim());
  const known = registry.get(id);
  if (known) return known;
  const pad = parseSudokuPad(source);
  if (typeof pad === 'string') return pad;
  const name = [library?.number, library?.title || pad.title].filter(Boolean).join(' · ') || 'SudokuPad puzzle';
  const author = library?.author || pad.author;
  const solution = pad.solution ? pad.solution.map(n => Math.max(0, n)) : [];
  const p: Puzzle = {
    ...CLASSIC, variant: 'sudokupad', id, name, difficulty: null, rating: author ? `By ${author}.` : 'Imported from SudokuPad.',
    givens: pad.givens, solution, pad: { ...pad, author, title: library?.title || pad.title, video: library?.video && /^https:\/\//.test(library.video) ? library.video : pad.video },
    library,
  };
  if (registry.size > 2000) registry.clear();
  registry.set(id, p);
  return p;
}
let resolve: ((id: string) => Puzzle | null) | null = null;
/** Where findPuzzle looks for a SudokuPad puzzle it has not seen: the app's saved sources, the server's library. */
export function setPuzzleResolver(fn: ((id: string) => Puzzle | null) | null) { resolve = fn; }
/** Whether a hint can be trusted: the classic rules are the whole puzzle. */
export const hintable = (p: Puzzle) => !p.pad || p.pad.classic;
/** Classic solutions left from these cells, for a SudokuPad classic grid (a "pick a cell" puzzle has several). */
export const padSolutions = (p: Puzzle, cells: number[]) => p.pad ? solveUnits(cells, p.pad.active, p.pad.units, p.pad.digits, 2) : null;

/** A catalog id, `custom-<81 digits>` or a registered SudokuPad puzzle; null for anything else. */
export function findPuzzle(id: unknown): Puzzle | null {
  if (typeof id !== 'string') return null;
  const pad = registry.get(id) ?? ((id.startsWith(LIBRARY_PREFIX) || id.startsWith(PAD_PREFIX)) && resolve ? resolve(id) : null);
  if (pad) return pad;
  if (id.startsWith(CUSTOM_PREFIX)) {
    const rest = id.slice(CUSTOM_PREFIX.length);
    if (!/^[0-9]{81}$/.test(rest)) return null;
    const p = customPuzzle(rest);
    return typeof p === 'string' ? null : p;
  }
  return CATALOG.find(p => p.id === id) ?? null;
}
