// The board as plain text, for chat: a grid with box lines (Samurai as one wide grid; a SudokuPad
// puzzle as its played area, without box lines), plus the puzzle's identity and any conflicts. Pure.
import { violations } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { activeCells, coord, isActive, widthOf } from './sudoku-extra.ts';

export function renderGrid(p: Puzzle, cells: number[]): string {
  const w = widthOf(p), lines: string[] = [];
  if (p.pad) {
    const at = activeCells(p), rows = at.map(i => Math.floor(i / w)), cols = at.map(i => i % w);
    for (let r = Math.min(...rows); r <= Math.max(...rows); r++) {
      const row: string[] = [];
      for (let c = Math.min(...cols); c <= Math.max(...cols); c++) row.push(!isActive(p, r * w + c) ? ' ' : cells[r * w + c] ? String(cells[r * w + c]) : '.');
      lines.push(row.join(' '));
    }
    return lines.join('\n');
  }
  for (let r = 0; r < w; r++) {
    if (p.variant !== 'samurai' && r && r % 3 === 0) lines.push('------+-------+------');
    const row: string[] = [];
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (p.variant !== 'samurai' && c && c % 3 === 0) row.push('|');
      row.push(!isActive(p, i) ? ' ' : cells[i] ? String(cells[i]) : '.');
    }
    lines.push(row.join(' '));
  }
  return lines.join('\n');
}

export function conflictList(p: Puzzle, cells: number[]): { rule: string; cells: string[]; message: string }[] {
  return violations(cells, p).map(v => ({ rule: v.rule, message: v.message, cells: v.cells.map(i => coord(p, i)) }));
}
