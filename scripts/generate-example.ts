// Makes the one bundled puzzle, deterministically: `node scripts/generate-example.ts [seed] [clues]`
// rewrites core/catalog.json. A grid is filled by a seeded randomized backtracking search; clues
// are then removed in a seeded random order, keeping each removal only while the puzzle still has
// exactly one solution (checked with the independent reference solver the tests use). Removal stops
// at the target clue count. `--check` compares the result with core/catalog.json and writes nothing. The difficulty label is provisional: "easy" when single-candidate steps
// alone finish the puzzle, "medium" otherwise. Nothing here comes from another puzzle collection.
import { readFileSync, writeFileSync } from 'node:fs';
import { reference } from '../core/__tests__/reference.ts';

const args = process.argv.slice(2).filter(a => a !== '--check'), check = process.argv.includes('--check');
const seed = Number(args[0] ?? 20261114), target = Number(args[1] ?? 36);

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const shuffle = <T>(a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const peers = (i: number): number[] => {
  const r = Math.floor(i / 9), c = i % 9, out = new Set<number>();
  for (let k = 0; k < 9; k++) { out.add(r * 9 + k); out.add(k * 9 + c); }
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) out.add((Math.floor(r / 3) * 3 + a) * 9 + Math.floor(c / 3) * 3 + b);
  out.delete(i);
  return [...out];
};
const PEERS = Array.from({ length: 81 }, (_, i) => peers(i));

/** A full valid grid: cells in order, digits tried in a seeded random order. */
function fill(): number[] {
  const cells = Array(81).fill(0);
  const go = (i: number): boolean => {
    if (i === 81) return true;
    for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (PEERS[i].some(j => cells[j] === n)) continue;
      cells[i] = n;
      if (go(i + 1)) return true;
    }
    cells[i] = 0;
    return false;
  };
  if (!go(0)) throw new Error('no grid');
  return cells;
}

const classic = { variant: 'classic', cages: [], thermometers: [], rowSandwich: Array(9).fill(null), colSandwich: Array(9).fill(null), consecutive: [] } as never;
const unique = (givens: number[]) => reference(classic, givens, 2).count === 1;

/** Does repeating "a cell with one candidate, or a digit with one place in a unit" solve it? */
function singlesSolve(givens: number[]): boolean {
  const cells = [...givens];
  const units: number[][] = [];
  for (let k = 0; k < 9; k++) {
    units.push(Array.from({ length: 9 }, (_, j) => k * 9 + j), Array.from({ length: 9 }, (_, j) => j * 9 + k),
      Array.from({ length: 9 }, (_, j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)));
  }
  const cand = (i: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !PEERS[i].some(j => cells[j] === n));
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < 81; i++) if (!cells[i]) { const c = cand(i); if (c.length === 1) { cells[i] = c[0]; progress = true; } }
    for (const u of units) for (let n = 1; n <= 9; n++) {
      if (u.some(i => cells[i] === n)) continue;
      const at = u.filter(i => !cells[i] && cand(i).includes(n));
      if (at.length === 1) { cells[at[0]] = n; progress = true; }
    }
  }
  return cells.every(Boolean);
}

const solution = fill();
const givens = [...solution];
let clues = 81;
for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k))) {
  if (clues <= target) break;
  const keep = givens[i];
  givens[i] = 0;
  if (unique(givens)) clues--; else givens[i] = keep;
}
if (!unique(givens)) throw new Error('not unique');
const easy = singlesSolve(givens);
const text = (a: number[]) => a.join('');
const catalog = {
  version: 1,
  puzzles: [{
    id: 'example-classic',
    name: 'Example — classic',
    variant: 'classic',
    difficulty: easy ? 'easy' : 'medium',
    rating: `Provisional rating, ${clues} clues: ${easy ? 'single-candidate steps alone solve it' : 'needs more than single-candidate steps'}.`,
    givens: text(givens),
    solution: text(solution),
  }],
};
const file = new URL('../core/catalog.json', import.meta.url), out = JSON.stringify(catalog, null, 2) + '\n';
if (check) {
  if (readFileSync(file, 'utf8') !== out) { console.error('core/catalog.json differs from the generator output'); process.exit(1); }
  console.log(`seed ${seed}: output matches core/catalog.json`);
} else {
  writeFileSync(file, out);
  console.log(`seed ${seed}: ${clues} clues, ${easy ? 'easy' : 'medium'}\n${text(givens)}`);
}
