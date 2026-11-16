import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import raw from './catalog.json';
import { CATALOG, CATALOG_ERRORS, CLASSIC, adjacentPairs, clueList, complete, conflicts, customPuzzle, filtered, findPuzzle, gridText, nextPuzzle, parseCatalog, parseGrid, peers, related, solveClassic, violations } from './sudoku.ts';
import type { Puzzle, Rules } from './sudoku.ts';
import { cageEdges } from './sudoku-draw.ts';
import { reference } from './__tests__/reference.ts';
import { S, seedPuzzle, transformed } from './__tests__/fixtures.ts';

const puzzle = transformed;
const blank = () => Array(81).fill(0);
const rules = (r: Partial<Rules>): Rules => ({ ...CLASSIC, ...r });
const swap = (cells: number[], a: number, b: number) => cells.map(n => (n === a ? b : n === b ? a : n));

// An independent counter of solutions (core/__tests__/reference.ts): its own candidate test per
// rule, never sharing code with the rules under test.
function countSolutions(p: Rules, givens: number[], limit = 2): number {
  return reference(p, givens, limit).count;
}

describe('classic rules', () => {
  it('preserves a unique solvable puzzle across deterministic transformations', () => {
    const seen = new Set<string>();
    for (const seed of [0, 1, 2, 42, 123456, 4294967295, ...Array.from({ length: 12 }, (_, i) => i * 7919)]) {
      const p = puzzle(seed);
      expect(puzzle(seed)).toEqual(p);
      expect(complete(p.solution)).toBe(true);
      expect(conflicts(p.givens).size).toBe(0);
      expect(p.givens.filter(Boolean)).toHaveLength(CATALOG[0].givens.filter(Boolean).length);
      expect(p.givens.every((n, i) => !n || n === p.solution[i])).toBe(true);
      expect(countSolutions(CLASSIC, p.givens)).toBe(1);
      seen.add(p.givens.join(''));
    }
    expect(seen.size).toBeGreaterThan(12);
  });
  it('finds row, column and box conflicts, ignores blanks, requires a full valid grid', () => {
    for (const other of [1, 9, 10]) {
      const cells = blank(); cells[0] = cells[other] = 3;
      expect([...conflicts(cells)]).toEqual([0, other]);
      expect(complete(cells)).toBe(false);
      expect(peers(0, other)).toBe(true);
    }
    expect(conflicts(blank()).size).toBe(0);
    expect(complete(S)).toBe(true);
    expect(complete(S.slice(0, 80))).toBe(false);
    const cells = [...S]; cells[80] = 0;
    expect(complete(cells)).toBe(false);
  });
});

describe('variant rules honor their exact constraints', () => {
  it('diagonal: each long diagonal repeats nothing, which classic ignores', () => {
    const cells = blank(); cells[0] = cells[80] = 1; cells[8] = cells[72] = 2;
    expect(conflicts(cells).size).toBe(0);
    expect([...conflicts(cells, rules({ variant: 'diagonal' }))].sort((a, b) => a - b)).toEqual([0, 8, 72, 80]);
    expect(complete(S)).toBe(true);
    expect(complete(S, rules({ variant: 'diagonal' }))).toBe(false);   // classic-valid, but 5 repeats on the main diagonal (R2C2, R4C4)
  });
  it('killer: distinct digits and an exact sum, with impossible partial sums flagged early', () => {
    const cage = rules({ variant: 'killer', cages: [{ sum: 6, cells: [0, 1, 2] }] });
    expect(complete(S, cage)).toBe(true);
    expect(complete(S, rules({ variant: 'killer', cages: [{ sum: 7, cells: [0, 1, 2] }] }))).toBe(false);
    expect(complete(S, rules({ variant: 'killer', cages: [{ sum: 5, cells: [0, 1, 2] }] }))).toBe(false);
    const partial = (digits: Record<number, number>, sum: number) => { const c = blank(); for (const [i, n] of Object.entries(digits)) c[Number(i)] = n; return conflicts(c, rules({ variant: 'killer', cages: [{ sum, cells: [0, 1, 2] }] })); };
    expect(partial({ 0: 5 }, 12).size).toBe(0);
    expect([...partial({ 0: 9, 1: 9 }, 12)].sort()).toContain(0);
    expect(partial({ 0: 8, 1: 7 }, 12).size).toBe(3);  // 15 already exceeds 12
    expect(partial({ 0: 1 }, 25).size).toBe(3);        // three digits cannot reach 25 with a 1
    expect(partial({ 0: 9, 1: 8 }, 24).size).toBe(0);  // 7 still fits
    expect(partial({ 0: 9, 1: 8 }, 25).size).toBe(3);  // 9+8+9 would repeat
    expect(partial({ 0: 9, 1: 8, 2: 7 }, 24).size).toBe(0);
  });
  it('thermo: digits strictly rise bulb to tip, and there must be room for the rest', () => {
    const thermo = (t: number[]) => rules({ variant: 'thermo', thermometers: [t] });
    expect(complete(S, thermo([1, 2, 3]))).toBe(true);       // 2 3 4
    expect(complete(S, thermo([3, 2, 1]))).toBe(false);      // 4 3 2 falls
    const swapped = swap(S, 3, 4);                           // classic-valid near miss
    expect(complete(swapped)).toBe(true);
    expect(complete(swapped, thermo([1, 2, 3]))).toBe(false);
    const c = blank();
    c[0] = 9; expect(conflicts(c, thermo([0, 1, 2])).size).toBe(1);  // 9 has no room to rise
    c[0] = 1; expect(conflicts(c, thermo([0, 1, 2])).size).toBe(0);
    c[2] = 2; expect([...conflicts(c, thermo([0, 1, 2]))].sort()).toEqual([0, 2]); // 1 then (blank) then 2 leaves no gap for the middle
    c[2] = 3; expect(conflicts(c, thermo([0, 1, 2])).size).toBe(0);
  });
  it('sandwich: the numbers strictly between the 1 and the 9, in rows and columns', () => {
    const row = (k: number, s: number | null) => rules({ variant: 'sandwich', rowSandwich: Array.from({ length: 9 }, (_, i) => (i === k ? s : null)) });
    const col = (k: number, s: number | null) => rules({ variant: 'sandwich', colSandwich: Array.from({ length: 9 }, (_, i) => (i === k ? s : null)) });
    expect(complete(S, row(0, 35))).toBe(true);      // 1 [2..8] 9
    expect(complete(S, row(0, 34))).toBe(false);
    expect(complete(S, row(0, 36))).toBe(false);
    expect(complete(S, row(1, 0))).toBe(true);       // 9 and 1 touch
    expect(complete(S, row(1, 1))).toBe(false);
    expect(S.filter((_, i) => i % 9 === 1).join('')).toBe('258369471');  // between the 9 and the 1: 4+7
    expect(complete(S, col(1, 11))).toBe(true);
    expect(complete(S, col(1, 12))).toBe(false);
    const c = blank(); c[27] = 9; c[29] = 7; c[30] = 6; c[32] = 1;     // row 4: 9 _ 7 6 _ 1
    expect(conflicts(c, row(3, 5)).size).toBe(6);                      // 13 already exceeds 5
    expect(conflicts(c, row(3, 14)).size).toBe(6);                     // two more digits add at least 5
    expect(conflicts(c, row(3, 20)).size).toBe(0);                     // 13 + 2 + 5 can still make 20
    c[28] = 2; c[31] = 3;
    expect(conflicts(c, row(3, 20)).size).toBe(6);                     // all between are filled: 18 is not 20
    c[32] = 0;
    expect(conflicts(c, row(3, 5)).size).toBe(0);                      // no 1 yet: nothing to measure
  });
  it('consecutive: bars join numbers differing by 1, and unbarred touching cells never do', () => {
    const bars = adjacentPairs.filter(([a, b]) => Math.abs(S[a] - S[b]) === 1);
    expect(bars.length).toBeGreaterThan(5);
    const all = rules({ variant: 'consecutive', consecutive: bars });
    expect(complete(S, all)).toBe(true);
    expect(complete(S, rules({ variant: 'consecutive', consecutive: bars.slice(1) }))).toBe(false);  // a missing bar
    const wrong = adjacentPairs.find(([a, b]) => Math.abs(S[a] - S[b]) !== 1)!;
    expect(complete(S, rules({ variant: 'consecutive', consecutive: [...bars, wrong] }))).toBe(false); // a false bar
    expect(complete(S, rules({ variant: 'consecutive', consecutive: [] }))).toBe(false);
    expect(complete(S)).toBe(true);
  });
  it('non-consecutive: no touching cells differ by 1', () => {
    const non = rules({ variant: 'nonconsecutive' });
    const c = blank(); c[0] = 3; c[1] = 4;
    expect([...conflicts(c, non)]).toEqual([0, 1]);
    c[1] = 5; expect(conflicts(c, non).size).toBe(0);
    c[1] = 3; expect(conflicts(c, non).size).toBe(2);        // a classic repeat still counts
    c[1] = 0; c[9] = 2; expect([...conflicts(c, non)]).toEqual([0, 9]); // vertical neighbours
    c[9] = 0; c[10] = 4; expect(conflicts(c, non).size).toBe(0);        // diagonal neighbours may differ by 1
    expect(complete(S, non)).toBe(false);                    // S has 1 next to 2
    expect(conflicts(S, { ...CLASSIC, variant: 'classic' }).size).toBe(0);
  });
  it('related cells follow the variant', () => {
    expect(related(CLASSIC, 0, 80)).toBe(false);
    expect(related(rules({ variant: 'diagonal' }), 0, 80)).toBe(true);
    expect(related(rules({ cages: [{ sum: 4, cells: [0, 10] }] }), 0, 10)).toBe(true);
    expect(related(rules({ thermometers: [[0, 10, 20]] }), 0, 20)).toBe(true);
    expect(related(CLASSIC, 5, 5)).toBe(false);
  });
});

describe('clue geometry and text', () => {
  it('outlines a cage on its outside edges only', () => {
    expect(cageEdges([0])).toHaveLength(4);
    expect(cageEdges([0, 1])).toHaveLength(6);                 // a domino: no edge between its cells
    expect(cageEdges([0, 1, 9, 10])).toHaveLength(8);
    expect(cageEdges([40]).every(([x1, y1, x2, y2]) => Math.min(x1, x2) >= 4 && Math.max(x1, x2) <= 5 && Math.min(y1, y2) >= 4 && Math.max(y1, y2) <= 5)).toBe(true);
  });
  it('lists every clue as text', () => {
    const text = clueList(rules({ variant: 'killer', cages: [{ sum: 12, cells: [2, 0, 1] }], thermometers: [[0, 9]], rowSandwich: [null, 7, ...Array(7).fill(null)], consecutive: [[0, 1]] })).map(g => `${g.title}: ${g.items.join('; ')}`).join('\n');
    expect(text).toContain('Sum 12: R1C1, R1C2, R1C3');
    expect(text).toContain('R1C1 → R2C1');
    expect(text).toContain('Row 2: 7');
    expect(clueList(CLASSIC)).toEqual([]);
  });
});

function made(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'fixture-1', name: 'Fixture', variant: 'classic', difficulty: 'easy', rating: 'Provisional test rating.', givens: puzzle(3).givens.join(''), solution: puzzle(3).solution.join(''), cages: [], thermometers: [], rowSandwich: Array(9).fill(null), colSandwich: Array(9).fill(null), consecutive: [], ...extra };
}
describe('parseCatalog', () => {
  it('accepts a well-formed puzzle and keeps the rest of the catalog when one entry is bad', () => {
    const ok = parseCatalog({ version: 1, puzzles: [made()] });
    expect(ok.errors).toEqual([]);
    expect(ok.puzzles[0].givens).toHaveLength(81);
    const mixed = parseCatalog({ version: 1, puzzles: [made(), made({ id: 'bad', variant: 'killer' }), made({ id: 'fixture-1' })] });
    expect(mixed.puzzles.map(p => p.id)).toEqual(['fixture-1']);
    expect(mixed.errors).toHaveLength(2);
  });
  it('rejects a bad shape, ids, grids, clues and a solution that breaks the rules', () => {
    const solution = puzzle(3).solution;
    const bad: Record<string, unknown>[] = [
      { id: 'Bad Id' }, { id: '' }, { name: ' ' }, { variant: 'x' }, { difficulty: 'impossible' }, { difficulty: undefined }, { rating: '' },
      { givens: '1'.repeat(80) }, { solution: '0'.repeat(81) }, { givens: 'x'.repeat(81) },
      { givens: solution.map((n, i) => (i ? 0 : n % 9 + 1)).join('') },                  // a given contradicts the solution
      { variant: 'killer', cages: [{ sum: 5, cells: [0, 0] }] }, { cages: [{ sum: 99, cells: [0] }] }, { cages: [{ sum: 5, cells: [81] }] },
      { variant: 'killer', cages: [{ sum: solution[0] + solution[1] + 1, cells: [0, 1] }] },   // a wrong sum
      { variant: 'thermo', thermometers: [[0]] }, { variant: 'thermo', thermometers: [[0, 40]] },
      { variant: 'sandwich', rowSandwich: Array(8).fill(1) }, { variant: 'sandwich', rowSandwich: [...Array(8).fill(null), 40] }, { variant: 'sandwich' },
      { variant: 'consecutive', consecutive: [[0, 2]] }, { variant: 'consecutive', consecutive: [[0, 0]] }, { variant: 'consecutive', consecutive: [[8, 9]] },
      { variant: 'diagonal', solution: S.join(''), givens: S.map((n, i) => (i % 3 ? 0 : n)).join('') },  // classic-valid, repeats on a diagonal
    ];
    for (const extra of bad) {
      const r = parseCatalog({ version: 1, puzzles: [made(extra)] });
      expect(r.puzzles, JSON.stringify(extra)).toEqual([]);
      expect(r.errors, JSON.stringify(extra)).toHaveLength(1);
    }
    for (const data of [null, [], {}, { version: 2, puzzles: [] }, { version: 1 }, { version: 1, puzzles: 'x' }, { version: 1, puzzles: [null, 4] }])
      expect(parseCatalog(data).puzzles).toEqual([]);
  });
});

describe('catalog lookup and entered puzzles', () => {
  it('finds catalog puzzles and entered ones, and nothing else', () => {
    for (const p of CATALOG) expect(findPuzzle(p.id)).toBe(p);
    const mine = seedPuzzle(5);
    expect(mine.id).toBe('custom-' + mine.givens.join(''));
    expect(findPuzzle(mine.id)).toBe(mine);
    expect(mine.difficulty).toBeNull();
    for (const id of ['custom-', 'custom-12', 'custom-' + '1'.repeat(81), 'custom-' + '0'.repeat(81), 'custom-' + 'x'.repeat(81), 'nope', '', null, 4, {}]) expect(findPuzzle(id)).toBeNull();
  });
  it('parses a typed grid: digits with . 0 or - for blanks, white space ignored', () => {
    const text = raw.puzzles[0].givens;
    expect(parseGrid(text.replace(/0/g, '.'))).toEqual(CATALOG[0].givens);
    expect(parseGrid(text.replace(/(.{9})/g, '$1\n'))).toHaveLength(81);
    expect(gridText(parseGrid(text) as number[])).toBe(text.replace(/0/g, '.'));
    expect(parseGrid('123')).toMatch(/81 cells/);
    expect(parseGrid('x'.repeat(81))).toMatch(/digits/);
  });
  it('accepts an entered puzzle only with exactly one solution', () => {
    const base = { givens: raw.puzzles[0].givens, solution: CATALOG[0].solution };
    const ok = customPuzzle(base.givens);
    expect(typeof ok).toBe('object');
    expect((ok as Puzzle).solution).toEqual(base.solution);
    const given = base.givens.split('').findIndex(c => c !== '0');
    const fewer = base.givens.split(''); for (let i = 0, k = 0; i < 81 && k < 14; i++) if (fewer[i] !== '0') { fewer[i] = '0'; k++; }
    expect(customPuzzle(fewer.join(''))).toMatch(/more than one solution/);          // too few clues
    const repeat = base.givens.split(''); repeat[(given + 1) % 81] = base.givens[given]; if (repeat[(given + 1) % 81] === '0') repeat[(given + 1) % 81] = '5';
    expect(typeof customPuzzle(repeat.join(''))).toBe('string');                      // a contradiction or a repeat
    const twin = '44' + base.givens.slice(2);                                       // two 4s in one row
    expect(customPuzzle(twin)).toMatch(/no solution/);
    expect(customPuzzle('0'.repeat(81))).toMatch(/empty/);
    expect(customPuzzle('12')).toMatch(/81 cells/);
  });
  it('the production solver agrees with the reference solver and counts correctly', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { givens, solution } = transformed(seed);
      expect(solveClassic(givens)).toMatchObject({ count: 1, solution });
      expect(reference(CLASSIC, givens, 2).count).toBe(1);
    }
    expect(solveClassic(Array(81).fill(0), 5).count).toBe(5);
    expect(solveClassic(Array(81).fill(0), 1, 3).exhausted).toBe(true);
    const clash = Array(81).fill(0); clash[0] = clash[1] = 4;
    expect(solveClassic(clash).count).toBe(0);
  });
  it('filters by variant and difficulty and cycles through the matches', () => {
    const a = { ...seedPuzzle(1), id: 'a', variant: 'killer' as const, difficulty: 'easy' as const }, b = { ...a, id: 'b', difficulty: 'hard' as const }, c = { ...a, id: 'c', variant: 'thermo' as const };
    const list = [a, b, c];
    expect(filtered('all', 'all', list)).toEqual(list);
    expect(filtered('killer', 'all', list).map(p => p.id)).toEqual(['a', 'b']);
    expect(filtered('all', 'easy', list).map(p => p.id)).toEqual(['a', 'c']);
    expect(filtered('thermo', 'hard', list)).toEqual([]);
    expect(nextPuzzle(list, 'a')?.id).toBe('b');
    expect(nextPuzzle(list, 'c')?.id).toBe('a');
    expect(nextPuzzle(list, 'elsewhere')?.id).toBe('a');
    expect(nextPuzzle([], 'a')).toBeNull();
  });
});

describe('the bundled catalog', () => {
  it('is exactly one plainly named classic puzzle, well formed, with no creator', () => {
    expect(CATALOG_ERRORS).toEqual([]);
    expect(CATALOG).toHaveLength(1);
    const p = CATALOG[0];
    expect(p).toMatchObject({ id: 'example-classic', name: 'Example — classic', variant: 'classic' });
    expect(p.rating.toLowerCase()).toContain('provisional');
    expect(Object.keys(raw.puzzles[0]).sort()).toEqual(['difficulty', 'givens', 'id', 'name', 'rating', 'solution', 'variant']);
  });
  it('has exactly one solution under its rules, equal to the stored one, found by both solvers', () => {
    const p = CATALOG[0];
    expect(complete(p.solution, p)).toBe(true);
    expect(reference(p, p.givens, 2)).toMatchObject({ count: 1, answer: p.solution });
    expect(solveClassic(p.givens)).toMatchObject({ count: 1, solution: p.solution });
  });
  it('is regenerated byte for byte by scripts/generate-example.ts', () => {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/generate-example.ts', import.meta.url)), '--check'], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('matches core/catalog.json');
  });
});
