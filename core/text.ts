// The board as plain text, for chat: a grid with box lines (Samurai as one wide grid), plus the
// puzzle's identity and any conflicts. Pure.
import { violations } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { isActive, widthOf } from './sudoku-extra.ts';

export function renderGrid(p: Puzzle, cells: number[]): string {
  const w = widthOf(p), lines: string[] = [];
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
  const w = widthOf(p);
  return violations(cells, p).map(v => ({ rule: v.rule, message: v.message, cells: v.cells.map(i => `R${Math.floor(i / w) + 1}C${(i % w) + 1}`) }));
}
