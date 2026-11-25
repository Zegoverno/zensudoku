import { expect, test } from 'vitest';
import { hintLesson, variantLessons } from './learning.ts';
import { CLASSIC } from './sudoku.ts';
import type { Puzzle, Variant } from './sudoku.ts';
import type { PadModel } from './sudokupad.ts';
import { CHAPTERS } from '../ui/handbook/chapters.js';
const p = (variant: Variant, rules?: string): Puzzle => ({
  ...CLASSIC, variant, id: 'test', name: 'Test', difficulty: null, rating: '', givens: [], solution: [],
  ...(rules !== undefined ? { pad: { rules: [rules], sandwichClues: [], chess: {} } as unknown as PadModel } : {}),
});
test('hint lessons follow the applied technique, not the board variant', () => {
  expect(hintLesson('naked')).toBe('naked-single');
  expect(hintLesson('hidden')).toBe('hidden-single');
  expect(hintLesson('none')).toBe('naked-pair');
  expect(hintLesson('conflict')).toBeUndefined();
});
test('variant lessons match rules, not decorations or puzzle names', () => {
  expect(variantLessons(p('sudokupad', 'Normal sudoku rules apply.'))).toEqual([]);
  expect(variantLessons(p('sudokupad', 'The green lines draw a picture.'))).toEqual([]);
  expect(variantLessons(p('sudokupad', 'Digits along thermometers increase from the bulb. Digits along an arrow sum to the digit in its circle.'))).toEqual(['arrows', 'thermo']);
  expect(variantLessons(p('sudokupad', 'Blue lines are region sum lines. Clues outside the grid give the sum of the digits along the indicated diagonal.'))).toEqual(['region-sum', 'little-killer']);
});
test('every built-in variant except classic has a real handbook destination', () => {
  const ids = new Set(CHAPTERS.flatMap(ch => ch.sections.map(s => s.id)));
  const variants = ['diagonal', 'killer', 'sandwich', 'thermo', 'consecutive', 'nonconsecutive', 'arrow', 'renban', 'kropki', 'littlekiller', 'jigsaw', 'samurai'] as const;
  for (const variant of variants) {
    const [id] = variantLessons(p(variant));
    expect(ids.has(id), variant).toBe(true);
  }
});
