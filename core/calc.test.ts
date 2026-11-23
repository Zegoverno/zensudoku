// The cage and sandwich calculator, against totals worked out by hand, and the numeric cages of puzzles.
// Every puzzle here is written for these tests.
import * as LZ from 'lz-string';
import { describe, expect, it } from 'vitest';
import { cageOf, comboFits, digitsIn, killerCombos, sandwichSets, sumCages } from './calc.ts';
import { padPuzzle } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { seedPuzzle } from './__tests__/fixtures.ts';

const lz = ((LZ as unknown as { compressToBase64?: unknown }).compressToBase64 ? LZ : (LZ as unknown as { default: typeof LZ }).default) as typeof LZ;
const text = (sets: number[][]) => sets.map(s => s.join('')).join(' ');

describe('killerCombos', () => {
  it('knows the well-known totals', () => {
    expect(text(killerCombos(17, 3))).toBe('179 269 278 359 368 458 467');
    expect(text(killerCombos(45, 9))).toBe('123456789');
    expect(text(killerCombos(3, 2))).toBe('12');
    expect(text(killerCombos(17, 2))).toBe('89');
    expect(text(killerCombos(10, 2))).toBe('19 28 37 46');
    expect(text(killerCombos(10, 4))).toBe('1234');
    expect(text(killerCombos(30, 4))).toBe('6789');
    expect(killerCombos(7, 1)).toEqual([[7]]);
    expect(text(killerCombos(20, 3))).toBe('389 479 569 578');
  });
  it('gives nothing for an impossible or malformed ask', () => {
    expect(killerCombos(2, 2)).toEqual([]);
    expect(killerCombos(18, 2)).toEqual([]);
    expect(killerCombos(10, 1)).toEqual([]);
    expect(killerCombos(46, 9)).toEqual([]);
    expect(killerCombos(10, 0)).toEqual([]);
    expect(killerCombos(10, 10)).toEqual([]);
    expect(killerCombos(NaN, 2)).toEqual([]);
    expect(killerCombos(1.5, 1)).toEqual([]);
  });
  it('keeps the digits a combination must hold and drops those it must not', () => {
    expect(text(killerCombos(17, 3, { must: [5] }))).toBe('359 458');
    expect(text(killerCombos(17, 3, { mustNot: [9] }))).toBe('278 368 458 467');
    expect(text(killerCombos(17, 3, { must: [4], mustNot: [5] }))).toBe('467');
    expect(killerCombos(17, 3, { must: [1, 2] })).toEqual([]);
  });
  it('follows the puzzle\'s digits (a 6×6 plays 1–6)', () => {
    expect(text(killerCombos(10, 2, { digits: 6 }))).toBe('46');
    expect(text(killerCombos(21, 6, { digits: 6 }))).toBe('123456');
    expect(killerCombos(9, 1, { digits: 6 })).toEqual([]);
  });
  it('lists sets with no repeats, ascending, in order', () => {
    const all = killerCombos(25, 5);
    for (const s of all) { expect(new Set(s).size).toBe(5); expect([...s].sort((a, b) => a - b)).toEqual(s); expect(s.reduce((a, b) => a + b)).toBe(25); }
    expect(all.map(s => s.join(''))).toEqual(all.map(s => s.join('')).sort());
  });
});

describe('sandwichSets', () => {
  it('groups the digits 2–8 by length', () => {
    expect(sandwichSets(0)).toEqual([{ length: 0, sets: [[]] }]);
    expect(sandwichSets(2)).toEqual([{ length: 1, sets: [[2]] }]);
    expect(sandwichSets(10)).toEqual([
      { length: 2, sets: [[2, 8], [3, 7], [4, 6]] },
      { length: 3, sets: [[2, 3, 5]] },
    ]);
    expect(sandwichSets(35)).toEqual([{ length: 7, sets: [[2, 3, 4, 5, 6, 7, 8]] }]);
    expect(sandwichSets(36)).toEqual([]);
    expect(sandwichSets(1)).toEqual([]);
  });
  it('never uses 1 or 9, and works for smaller grids', () => {
    for (let s = 0; s <= 35; s++) for (const g of sandwichSets(s)) for (const set of g.sets) expect(set.every(d => d >= 2 && d <= 8)).toBe(true);
    expect(sandwichSets(9, 6)).toEqual([{ length: 2, sets: [[4, 5]] }, { length: 3, sets: [[2, 3, 4]] }]);
    expect(sandwichSets(-1)).toEqual([]);
  });
});

describe('cages of a puzzle', () => {
  it('a built-in killer: its cages, as given', () => {
    const p = { ...seedPuzzle(1), variant: 'killer', cages: [{ sum: 10, cells: [1, 0] }, { sum: 17, cells: [9, 10, 18] }] } as Puzzle;
    expect(sumCages(p)).toEqual([{ sum: 10, cells: [0, 1] }, { sum: 17, cells: [9, 10, 18] }]);
    expect(cageOf(p, 10)).toEqual({ sum: 17, cells: [9, 10, 18] });
    expect(cageOf(p, 40)).toBeNull();
  });
  it('a SudokuPad puzzle: killer cages with a number only; no metadata, shapes or text labels', () => {
    const boxes = '[[[0,0],[0,1],[1,0],[1,1]],[[0,2],[0,3],[1,2],[1,3]],[[2,0],[2,1],[3,0],[3,1]],[[2,2],[2,3],[3,2],[3,3]]]';
    const src = `{ce:[[,,,],[,,,],[,,,],[,,,]],re:${boxes},ca:[{ce:[[0,0],[0,1]],v:3},{ce:[[2,2],[2,3]],v:'x'},{ce:[[3,0]]},{ce:[[1,1],[1,2]],v:5,style:'box'},{v:'title: Cages'}]}`;
    const p = padPuzzle('scl' + lz.compressToBase64(src));
    if (typeof p === 'string') throw new Error(p);
    expect(sumCages(p)).toEqual([{ sum: 3, cells: [0, 1] }]);
    expect(cageOf(p, 1)?.sum).toBe(3);
    expect(cageOf(p, 10)).toBeNull();
  });
  it('rejects a whole SudokuPad cage if any coordinate is invalid, even if it aliases a played cell', () => {
    const src = "{ce:[[,,,],[,,,],[,,,],[,,,]],ca:[{ce:[[3,3],[0,0]],v:3},{ce:[[0,1],[0,4]],v:4},{ce:[[1,-1]],v:5},{ce:[[-1,4]],v:6},{ce:[[4,-1]],v:7}]}";
    const p = padPuzzle('scl' + lz.compressToBase64(src));
    if (typeof p === 'string') throw new Error(p);
    if (!p.pad) throw new Error('Expected a SudokuPad model');
    // The decoder drops fractional cells, so exercise the calculator's integer guard directly.
    const cage = p.pad.cages[0];
    p.pad.cages.push({ ...cage, cells: [[0.25, 0]] }, { ...cage, cells: [[0, 0.5], [0.125, 0.5]] });
    expect(sumCages(p)).toEqual([{ sum: 3, cells: [0, 15] }]);
    expect(cageOf(p, 4)).toBeNull();
  });
});

describe('helpers', () => {
  it('a combination fits the placed digits when it holds them all, once', () => {
    expect(comboFits([1, 7, 9], [])).toBe(true);
    expect(comboFits([1, 7, 9], [9])).toBe(true);
    expect(comboFits([2, 6, 9], [7])).toBe(false);
    expect(comboFits([1, 7, 9], [9, 9])).toBe(false);
  });
  it('reads digits from what was typed', () => {
    expect(digitsIn('1 3,5')).toEqual([1, 3, 5]);
    expect(digitsIn('5310')).toEqual([1, 3, 5]);
    expect(digitsIn('')).toEqual([]);
  });
});
