// Test fixtures made by this repo's own code; none comes from a puzzle collection.
//  - S: a complete valid grid built from a shifted pattern (the simplest Sudoku solution).
//  - seedPuzzle(seed): a unique classic puzzle: the bundled example under a seeded
//    Sudoku-preserving transformation (relabeled digits, shuffled rows and columns within bands,
//    shuffled bands, optional transpose). Uniqueness survives these, so it is a proper puzzle.
//  - SAMURAI_SOLUTION: a valid 21×21 Samurai fill, found once by the reference solver.
import raw from '../catalog.json';
import { customPuzzle } from '../sudoku.ts';
import type { Puzzle } from '../sudoku.ts';

export const S: number[] = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9), c = i % 9;
  return ((3 * (r % 3) + Math.floor(r / 3) + c) % 9) + 1;
});

export function transformed(seed: number): { givens: number[]; solution: number[] } {
  let state = seed >>> 0;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const order = () => shuffle([0, 1, 2]).flatMap(b => shuffle([0, 1, 2]).map(i => b * 3 + i));
  const rows = order(), cols = order(), digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]), transpose = rand() < 0.5;
  const base = raw.puzzles[0];
  const apply = (s: string) => rows.flatMap(r => cols.map(c => {
    const n = Number(s[transpose ? c * 9 + r : r * 9 + c]);
    return n ? digits[n - 1] : 0;
  }));
  return { givens: apply(base.givens), solution: apply(base.solution) };
}
export function seedPuzzle(seed: number): Puzzle {
  const p = customPuzzle(transformed(seed).givens.join(''));
  if (typeof p === 'string') throw new Error(p);
  return p;
}
export const seedId = (seed: number) => seedPuzzle(seed).id;

export const SAMURAI_SOLUTION = '123456789000351246789456789123000672589134789123456000984137256231674895000413752968875912364000725968341694538217000896413572317265948123567821493542897631579248395617968341572468139674825000000126754893000000000000357982416000000000000489316725000000346789215637984123567589123764891352679148127456893245671458239261834579000125864793473695128000437915682895217346000869237415612348957000243581976758961432000518796324934572681000796342851';
