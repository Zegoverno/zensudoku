import { describe, it, expect } from 'vitest';
import { CATALOG } from './sudoku.ts';
import { candidates, hint } from './hint.ts';
import { conflictList, renderGrid } from './text.ts';

const p = CATALOG[0];

describe('hint', () => {
  it('walks the example to the end one explained single at a time, never wrong, never the whole solution', () => {
    const cells = [...p.givens];
    const kinds = new Set<string>();
    for (let step = 0; step < 81; step++) {
      const h = hint(p, cells);
      if (h.kind === 'solved') break;
      expect(['naked', 'hidden'], h.message).toContain(h.kind);
      kinds.add(h.kind);
      expect(h.cell).toBeDefined();
      expect(cells[h.cell!]).toBe(0);
      expect(h.value).toBe(p.solution[h.cell!]);
      expect(h.message).toMatch(/R\dC\d/);
      expect(Object.keys(h).sort()).toEqual(['because', 'cell', 'kind', 'message', 'value'].sort());
      cells[h.cell!] = h.value!;
    }
    expect(hint(p, cells).kind).toBe('solved');
    expect(cells).toEqual(p.solution);
    expect(kinds.size).toBeGreaterThan(0);
  });
  it('finds a hidden single when no cell has only one candidate', () => {
    // Digit 1 can only go in R1C9 of row 1: every other empty cell of the row sees a 1 in its column.
    const cells = Array(81).fill(0);
    [1, 4, 7, 2, 5, 8, 3, 6].forEach((r, c) => { cells[r * 9 + c] = 1; });   // a 1 in columns 1–8, none in row 1
    const h = hint({ ...p, givens: cells, solution: p.solution }, cells);
    expect(h.kind).toBe('hidden');
    expect(h).toMatchObject({ value: 1, cell: 8 });
    expect(h.message).toMatch(/only one place left/);
  });
  it('says what is wrong before it hints', () => {
    const cells = [...p.givens], empty = cells.findIndex(n => !n);
    const row = cells.map((n, i) => (n && Math.floor(i / 9) === Math.floor(empty / 9) ? i : -1)).find(i => i >= 0)!;
    cells[empty] = cells[row];
    expect(hint(p, cells)).toMatchObject({ kind: 'conflict' });
    const wrong = [...p.givens];
    const digit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(n => n !== p.solution[empty] && candidates(p, wrong, empty).includes(n))!;
    wrong[empty] = digit;
    const h = hint(p, wrong);
    expect(h.kind).toBe('mistake');
    expect(h.message).toMatch(/1 entry does not match/);
    expect(h.cell).toBeUndefined();
  });
  it('is quiet when nothing simple is left, and says solved when it is', () => {
    const sparse = [...p.givens]; let kept = 0;
    for (let i = 0; i < 81; i++) if (sparse[i] && ++kept > 6) sparse[i] = 0;
    expect(hint({ ...p, givens: sparse }, sparse).kind).toBe('none');
    expect(hint(p, p.solution).kind).toBe('solved');
  });
  it('lists candidates from the digits on the board', () => {
    const cells = Array(81).fill(0); cells[1] = 5; cells[9] = 6; cells[10] = 7;
    expect(candidates(p, cells, 0)).toEqual([1, 2, 3, 4, 8, 9]);
    expect(candidates(p, cells, 1)).toEqual([]);
  });
});

describe('text board', () => {
  it('draws rows with box separators and blanks as dots', () => {
    const lines = renderGrid(p, p.givens).split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[3]).toBe('------+-------+------');
    expect(lines[0]).toMatch(/^[1-9.] [1-9.] [1-9.] \| [1-9.] [1-9.] [1-9.] \| [1-9.] [1-9.] [1-9.]$/);
    expect(renderGrid(p, p.givens).replace(/[^1-9]/g, '')).toBe(p.givens.filter(Boolean).join(''));
  });
  it('names conflicts by cell', () => {
    const cells = Array(81).fill(0); cells[0] = cells[1] = 3;
    expect(conflictList(p, cells)[0]).toMatchObject({ rule: 'row', cells: ['R1C1', 'R1C2'] });
    expect(conflictList(p, Array(81).fill(0))).toEqual([]);
  });
});
