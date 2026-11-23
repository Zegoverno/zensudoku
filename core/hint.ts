// The next logical step on a board: a naked single or a hidden single, explained, never the whole
// solution. Pure. It reasons only from the digits on the board and the unit rules (rows, columns,
// boxes, irregular regions, diagonals), not from the player's notes; the variant clues (cages,
// thermometers…) are not used, so a variant puzzle may offer fewer hints than it has steps. A SudokuPad
// puzzle gets hints only when its rules are the classic ones; its other rules are text this cannot read.
import { complete, hintable, padSolutions, violations, wrongEntries } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { activeCells, coord, digitsOf, geometryUnits } from './sudoku-extra.ts';
import type { Unit } from './sudoku-extra.ts';

export type HintKind = 'naked' | 'hidden' | 'none' | 'conflict' | 'mistake' | 'solved' | 'unavailable';
export interface Hint {
  kind: HintKind;
  /** The cell to look at and the digit that belongs there (for naked and hidden). */
  cell?: number;
  value?: number;
  /** The cells that make the step work (the blocking digits' cells or the unit). */
  because?: number[];
  message: string;
}

const digits = (p: Puzzle) => Array.from({ length: digitsOf(p) }, (_, k) => k + 1);
const unitsFor = (p: Puzzle): Unit[] => geometryUnits(p);

/** Digits a cell can still take: those not already in any unit it belongs to. */
export function candidates(p: Puzzle, cells: number[], i: number, units: Unit[] = unitsFor(p)): number[] {
  if (cells[i]) return [];
  const seen = new Set<number>();
  for (const u of units) if (u.cells.includes(i)) for (const j of u.cells) if (cells[j]) seen.add(cells[j]);
  return digits(p).filter(n => !seen.has(n));
}

export function hint(p: Puzzle, cells: number[]): Hint {
  if (!hintable(p)) return { kind: 'unavailable', message: 'Hints aren\'t available for this variant: its rules are more than rows, columns and regions.' };
  const bad = violations(cells, p);
  if (bad.length) return { kind: 'conflict', because: bad[0].cells, message: `Something is broken first: ${bad[0].message}` };
  if (complete(cells, p)) return { kind: 'solved', message: 'The puzzle is solved.' };
  const wrong = wrongEntries(cells, p);
  if (!wrong && p.pad && !p.pad.solution && padSolutions(p, cells)?.count === 0)
    return { kind: 'mistake', message: 'The entries so far leave the puzzle no solution, so a hint could mislead. Check the board and remove the wrong entries first.' };
  if (wrong) return { kind: 'mistake', message: `${wrong} ${wrong === 1 ? 'entry does' : 'entries do'} not match the solution, so a hint could mislead. Check the board and remove the wrong ${wrong === 1 ? 'entry' : 'entries'} first.` };
  const units = unitsFor(p), cellsToTry = activeCells(p).filter(i => !cells[i]);
  const at = (i: number) => coord(p, i);

  for (const i of cellsToTry) {
    const c = candidates(p, cells, i, units);
    if (c.length !== 1) continue;
    const mine = units.filter(u => u.cells.includes(i));
    const parts = mine.flatMap(u => {
      const have = [...new Set(u.cells.filter(j => cells[j]).map(j => cells[j]))].sort((a, b) => a - b);
      return have.length ? [`${u.label} holds ${have.join(', ')}`] : [];
    });
    const because = [...new Set(mine.flatMap(u => u.cells.filter(j => cells[j])))];
    return { kind: 'naked', cell: i, value: c[0], because,
      message: `${at(i)} can only be ${c[0]}: every other digit is already ruled out (${parts.join('; ')}).` };
  }
  for (const u of units) for (const n of digits(p)) {
    if (u.cells.some(j => cells[j] === n)) continue;
    const spots = u.cells.filter(j => !cells[j] && candidates(p, cells, j, units).includes(n));
    if (spots.length !== 1) continue;
    return { kind: 'hidden', cell: spots[0], value: n, because: u.cells,
      message: `In ${u.label}, the ${n} has only one place left: ${at(spots[0])}. Every other empty cell there is blocked by a ${n} in its row, column or box.` };
  }
  return { kind: 'none', message: 'No single step is available from the digits alone. Try writing candidates in the empty cells, then look for a pair of cells sharing the same two candidates.' };
}
