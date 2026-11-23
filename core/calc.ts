// The cage and sandwich calculator: which sets of digits can make a killer cage's total or a sandwich
// clue, and the cages of a puzzle that carry a numeric total. Pure functions, unit tested.
import type { Puzzle } from './sudoku.ts';

export interface ComboOptions {
  /** Digits every combination must hold. */
  must?: number[];
  /** Digits no combination may hold. */
  mustNot?: number[];
  /** Digits 1..digits are available (default 9). */
  digits?: number;
}

/** Every set of `cells` distinct digits from 1..digits that adds up to `sum`, each set ascending, sets in
 *  lexicographic order (17 in 3: 179 269 278 359 368 458 467). Nothing for an impossible or malformed ask. */
export function killerCombos(sum: number, cells: number, opts: ComboOptions = {}): number[][] {
  const digits = Math.max(1, Math.min(9, Math.floor(opts.digits ?? 9)));
  if (!Number.isInteger(sum) || !Number.isInteger(cells) || cells < 1 || cells > digits || sum < 1) return [];
  const must = new Set(opts.must ?? []), not = new Set(opts.mustNot ?? []);
  const out: number[][] = [], pick: number[] = [];
  const walk = (from: number, left: number, need: number) => {
    if (need === 0) {
      if (left === 0 && [...must].every(d => pick.includes(d))) out.push([...pick]);
      return;
    }
    for (let d = from; d <= digits && d <= left; d++) {
      if (not.has(d)) continue;
      pick.push(d);
      walk(d + 1, left - d, need - 1);
      pick.pop();
    }
  };
  walk(1, sum, cells);
  return out;
}

/** The sets of distinct digits from 2..n−1 (the digits a sandwich can hold between 1 and n) that add up to
 *  `sum`, grouped by how many digits they have, shortest first. A sum of 0 is the empty sandwich. */
export function sandwichSets(sum: number, n = 9): { length: number; sets: number[][] }[] {
  if (!Number.isInteger(sum) || sum < 0 || !Number.isInteger(n) || n < 3 || n > 9) return [];
  if (sum === 0) return [{ length: 0, sets: [[]] }];
  const out: { length: number; sets: number[][] }[] = [];
  for (let len = 1; len <= n - 2; len++) {
    const sets = killerCombos(sum, len, { digits: n - 1, mustNot: [1] });
    if (sets.length) out.push({ length: len, sets });
  }
  return out;
}

/** A cage with a numeric total, as played cell indices. */
export interface SumCage { sum: number; cells: number[] }

/** The cages of a puzzle that carry a numeric total: a built-in killer's cages, or a SudokuPad puzzle's killer
 *  cages whose label is a number and whose cells are all played. Metadata cages, shapes and unlabelled cages are not. */
export function sumCages(p: Puzzle): SumCage[] {
  if (!p.pad) return p.cages.map(c => ({ sum: c.sum, cells: [...c.cells].sort((a, b) => a - b) }));
  const pad = p.pad, active = new Set(pad.active), out: SumCage[] = [];
  for (const c of pad.cages) {
    if (c.sum == null) continue;
    const cells = c.cells.map(([r, col]) => r * pad.cols + col);
    if (!cells.length || cells.some(i => !active.has(i))) continue;
    out.push({ sum: c.sum, cells: [...new Set(cells)].sort((a, b) => a - b) });
  }
  return out;
}
const cageCache = new WeakMap<Puzzle, SumCage[]>();
/** The numeric cage holding cell `i`, or null. */
export function cageOf(p: Puzzle, i: number): SumCage | null {
  let list = cageCache.get(p);
  if (!list) cageCache.set(p, list = sumCages(p));
  return list.find(c => c.cells.includes(i)) ?? null;
}

/** Whether a combination is still possible given the digits already placed in the cage: each placed digit
 *  is in it, none twice. */
export function comboFits(combo: number[], placed: number[]): boolean {
  return new Set(placed).size === placed.length && placed.every(d => combo.includes(d));
}

/** The digits 1–9 written in a text ("1 3 5", "135", "1,3"), once each, ascending. */
export const digitsIn = (text: string): number[] => [...new Set([...text].filter(ch => /[1-9]/.test(ch)).map(Number))].sort((a, b) => a - b);
