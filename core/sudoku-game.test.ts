import { describe, it, expect } from 'vitest';
import { CATALOG } from './sudoku.ts';
import type { Puzzle } from './sudoku.ts';
import { seedId as legacyId, seedPuzzle as legacyPuzzle, transformed as puzzle } from './__tests__/fixtures.ts';
import { MAX_HISTORY, STORAGE_KEY, seenBy, setAutoClear, blankBoard, boardOf, choose, enter, erase, isDone, load, newGame, next, notesOf, peekBoard, place, puzzleOf, redo, reset, restore, select, serialize, setColor, setFilters, toggleNote, undo } from './sudoku-game.ts';
import type { Game } from './sudoku-game.ts';

/** A game on an entered puzzle (a transformed copy of the example), so the catalog may grow freely. */
const fresh = (seed = 1): Game => newGame(legacyPuzzle(seed));
const emptyCell = (g: Game, nth = 0) => boardOf(g).cells.flatMap((n, i) => (n ? [] : [i]))[nth];
const givenCell = (g: Game) => puzzleOf(g).givens.findIndex(Boolean);
const at = (g: Game, i: number) => { select(g, i); return g; };

describe('values and notes', () => {
  it('toggles corner and center notes independently of each other and of values', () => {
    const g = fresh(), i = emptyCell(g);
    at(g, i);
    expect(toggleNote(g, 'corner', 3)).toBe(true);
    expect(toggleNote(g, 'corner', 1)).toBe(true);
    expect(toggleNote(g, 'center', 3)).toBe(true);
    expect(notesOf(boardOf(g).corner[i])).toEqual([1, 3]);
    expect(notesOf(boardOf(g).center[i])).toEqual([3]);
    expect(toggleNote(g, 'corner', 3)).toBe(true);                  // toggling again removes it
    expect(notesOf(boardOf(g).corner[i])).toEqual([1]);
    expect(notesOf(boardOf(g).center[i])).toEqual([3]);             // the other kind is untouched
    expect(boardOf(g).cells[i]).toBe(0);
    expect(toggleNote(g, 'corner', 0)).toBe(false);
    expect(toggleNote(g, 'center', 10)).toBe(false);
  });
  it('entering a number clears that cell\'s notes, and a filled cell takes none', () => {
    const g = fresh(), i = emptyCell(g), j = emptyCell(g, 1);
    at(g, j); toggleNote(g, 'center', 4);
    at(g, i); toggleNote(g, 'corner', 2); toggleNote(g, 'center', 5);
    expect(place(g, 6)).toBe(true);
    expect(boardOf(g).cells[i]).toBe(6);
    expect(boardOf(g).corner[i] | boardOf(g).center[i]).toBe(0);
    expect(notesOf(boardOf(g).center[j])).toEqual([4]);             // other cells keep theirs
    expect(toggleNote(g, 'corner', 2)).toBe(false);
    expect(place(g, 6)).toBe(false);                                // no change, no history
  });
  it('follows the entry mode', () => {
    const g = fresh(), i = emptyCell(g);
    at(g, i);
    g.mode = 'corner'; enter(g, 7);
    g.mode = 'center'; enter(g, 8);
    g.mode = 'value'; expect(boardOf(g).cells[i]).toBe(0);
    expect(notesOf(boardOf(g).corner[i])).toEqual([7]);
    expect(notesOf(boardOf(g).center[i])).toEqual([8]);
    enter(g, 9);
    expect(boardOf(g).cells[i]).toBe(9);
  });
  it('protects givens: no value, no notes, no erase', () => {
    const g = fresh(), i = givenCell(g), v = boardOf(g).cells[i];
    at(g, i);
    expect(place(g, v % 9 + 1)).toBe(false);
    expect(toggleNote(g, 'corner', 1)).toBe(false);
    expect(erase(g)).toBe(false);
    expect(boardOf(g).cells[i]).toBe(v);
    expect(reset(g)).toBe(false);                                   // nothing to reset yet
    expect(undo(g)).toBe(false);
  });
  it('erases the value, then the notes, then the color', () => {
    const g = fresh(), i = emptyCell(g);
    at(g, i);
    setColor(g, 2); toggleNote(g, 'corner', 1); toggleNote(g, 'center', 2);
    place(g, 5);
    expect(erase(g)).toBe(true); expect(boardOf(g).cells[i]).toBe(0);
    expect(boardOf(g).colors[i]).toBe(2);                           // placing kept the color
    expect(erase(g)).toBe(true); expect(boardOf(g).colors[i]).toBe(0);
    expect(erase(g)).toBe(false);                                   // nothing left
    toggleNote(g, 'corner', 1); setColor(g, 2);
    expect(erase(g)).toBe(true);
    expect(boardOf(g).corner[i]).toBe(0); expect(boardOf(g).colors[i]).toBe(2);
    expect(erase(g)).toBe(true); expect(boardOf(g).colors[i]).toBe(0);
  });
  it('colors a cell, toggles the same color off, rejects unknown colors; a given may be colored', () => {
    const g = fresh(), i = givenCell(g);
    at(g, i);
    expect(setColor(g, 3)).toBe(true); expect(boardOf(g).colors[i]).toBe(3);
    expect(setColor(g, 3)).toBe(true); expect(boardOf(g).colors[i]).toBe(0);
    expect(setColor(g, 7)).toBe(false); expect(setColor(g, -1)).toBe(false);
    setColor(g, 4);
    expect(erase(g)).toBe(true); expect(boardOf(g).colors[i]).toBe(0);
    expect(boardOf(g).cells[i]).toBe(puzzleOf(g).givens[i]);
  });
  it('selection stays inside the board', () => {
    const g = fresh();
    expect(select(g, 80)).toBe(true); expect(select(g, 81)).toBe(false); expect(select(g, -1)).toBe(false); expect(select(g, 1.5)).toBe(false);
    expect(boardOf(g).selected).toBe(80);
  });
  it('locks values and notes once complete, and reopens on undo', () => {
    const g = fresh(), p = puzzleOf(g), b = boardOf(g), i = emptyCell(g);
    b.cells = [...p.solution]; b.cells[i] = 0;
    at(g, i); place(g, p.solution[i]);
    expect(isDone(g)).toBe(true);
    at(g, emptyCell(g) ?? 0);
    expect(place(g, p.solution[i] % 9 + 1)).toBe(false);
    expect(erase(g)).toBe(false);
    at(g, i);
    expect(undo(g)).toBe(true);
    expect(isDone(g)).toBe(false);
  });
});

describe('clearing notes automatically', () => {
  /** Empty cells of the board that see `i` and empty cells that do not. */
  const split = (g: Game, i: number) => {
    const seen = new Set(seenBy(puzzleOf(g), i)), empty = boardOf(g).cells.flatMap((n, j) => (n || j === i ? [] : [j]));
    return { peers: empty.filter(j => seen.has(j)), others: empty.filter(j => !seen.has(j)) };
  };
  const note = (g: Game, j: number, kind: 'corner' | 'center', n: number) => { at(g, j); toggleNote(g, kind, n); };
  it('is on by default, and placing a digit takes it out of the corner and center notes of every cell that sees it', () => {
    const g = fresh(), i = emptyCell(g), { peers, others } = split(g, i);
    expect(g.autoClear).toBe(true);
    const [a, b] = peers, [far] = others;
    note(g, a, 'corner', 5); note(g, a, 'corner', 2); note(g, b, 'center', 5); note(g, far, 'center', 5);
    at(g, i);
    expect(place(g, 5)).toBe(true);
    const bd = boardOf(g);
    expect(notesOf(bd.corner[a])).toEqual([2]);                   // only that digit goes
    expect(bd.center[b]).toBe(0);
    expect(notesOf(bd.center[far])).toEqual([5]);                 // a cell that does not see it keeps it
  });
  it('is one undo step with the placement, and redo applies both again', () => {
    const g = fresh(), i = emptyCell(g), { peers } = split(g, i), [a, b] = peers;
    note(g, a, 'corner', 4); note(g, b, 'center', 4); note(g, b, 'center', 7);
    at(g, i);
    place(g, 4);
    expect(undo(g)).toBe(true);
    const bd = boardOf(g);
    expect(bd.cells[i]).toBe(0);
    expect(notesOf(bd.corner[a])).toEqual([4]);
    expect(notesOf(bd.center[b])).toEqual([4, 7]);
    expect(bd.selected).toBe(i);
    expect(redo(g)).toBe(true);
    expect(bd.cells[i]).toBe(4);
    expect(bd.corner[a]).toBe(0);
    expect(notesOf(bd.center[b])).toEqual([7]);
    expect(bd.selected).toBe(i);
    expect(undo(g)).toBe(true);                                   // and the notes before were their own steps
    expect(undo(g)).toBe(true);
    expect(notesOf(bd.center[b])).toEqual([4]);
  });
  it('can be switched off, and the switch is saved (an old save means on)', () => {
    const g = fresh(), i = emptyCell(g), { peers: [a] } = split(g, i);
    setAutoClear(g, false);
    note(g, a, 'corner', 3);
    at(g, i); place(g, 3);
    expect(notesOf(boardOf(g).corner[a])).toEqual([3]);
    expect(restore(serialize(g))!.autoClear).toBe(false);
    setAutoClear(g, true);
    expect(restore(serialize(g))!.autoClear).toBe(true);
    const old = JSON.parse(serialize(g)); delete old.autoClear;
    expect(restore(JSON.stringify(old))!.autoClear).toBe(true);
  });
  it('erasing, notes and colors never clear other cells', () => {
    const g = fresh(), i = emptyCell(g), { peers: [a] } = split(g, i);
    note(g, a, 'corner', 6);
    at(g, i); g.mode = 'center'; enter(g, 6); g.mode = 'value'; setColor(g, 2); place(g, 1); erase(g);
    expect(notesOf(boardOf(g).corner[a])).toEqual([6]);
  });
  it('sees by the basic rules only: rows, columns, boxes, regions and diagonals, never cages', () => {
    const base = puzzleOf(fresh());
    const classic = seenBy(base, 0);
    expect(classic).toHaveLength(20);
    expect(classic).toEqual(expect.arrayContaining([1, 8, 9, 72, 10, 20]));
    expect(classic).not.toContain(40);
    const diagonal = seenBy({ ...base, variant: 'diagonal' } as Puzzle, 0);
    expect(diagonal).toContain(40);
    expect(diagonal).toContain(80);
    const killer = seenBy({ ...base, variant: 'killer', cages: [{ sum: 10, cells: [0, 40] }] } as Puzzle, 0);
    expect(killer).not.toContain(40);
  });
});

describe('undo and redo', () => {
  it('walks back and forth over values, notes and colors, and forgets redo on a new edit', () => {
    const g = fresh(), i = emptyCell(g);
    at(g, i);
    toggleNote(g, 'corner', 1); toggleNote(g, 'center', 2); setColor(g, 1); place(g, 4);
    expect(undo(g)).toBe(true);
    expect(boardOf(g).cells[i]).toBe(0);
    expect(notesOf(boardOf(g).corner[i])).toEqual([1]);             // the notes the number replaced are back
    expect(notesOf(boardOf(g).center[i])).toEqual([2]);
    expect(undo(g)).toBe(true); expect(boardOf(g).colors[i]).toBe(0);
    expect(redo(g)).toBe(true); expect(boardOf(g).colors[i]).toBe(1);
    expect(redo(g)).toBe(true); expect(boardOf(g).cells[i]).toBe(4);
    expect(redo(g)).toBe(false);
    undo(g); undo(g); undo(g); undo(g);
    expect(boardOf(g).corner[i] | boardOf(g).center[i] | boardOf(g).colors[i]).toBe(0);
    expect(undo(g)).toBe(false);
    toggleNote(g, 'corner', 9);
    expect(redo(g)).toBe(false);
  });
  it('moves the selection to the changed cell', () => {
    const g = fresh(), i = emptyCell(g), j = emptyCell(g, 3);
    at(g, i); place(g, 1); at(g, j);
    undo(g);
    expect(boardOf(g).selected).toBe(i);
  });
  it('treats a reset as one undoable step', () => {
    const g = fresh(), i = emptyCell(g), j = emptyCell(g, 2);
    at(g, i); place(g, 1); toggleNote(g, 'corner', 3); at(g, j); toggleNote(g, 'center', 5); setColor(g, 2);
    expect(reset(g)).toBe(true);
    expect(boardOf(g)).toEqual({ ...blankBoard(puzzleOf(g)), selected: boardOf(g).selected });
    expect(undo(g)).toBe(true);
    expect(boardOf(g).cells[i]).toBe(1);
    expect(notesOf(boardOf(g).center[j])).toEqual([5]);
    expect(boardOf(g).colors[j]).toBe(2);
    expect(redo(g)).toBe(true);
    expect(boardOf(g).cells[i]).toBe(0);
  });
  it('caps the history and keeps a separate one per puzzle', () => {
    const g = fresh(), i = emptyCell(g);
    at(g, i);
    for (let k = 0; k < MAX_HISTORY + 20; k++) toggleNote(g, 'corner', 1);
    let steps = 0;
    while (undo(g)) steps++;
    expect(steps).toBe(MAX_HISTORY);
    place(g, 2);
    choose(g, legacyId(2));
    expect(undo(g)).toBe(false);
    choose(g, legacyId(1));
    expect(undo(g)).toBe(true);
  });
});

describe('the catalog in play', () => {
  it('keeps each puzzle\'s progress while browsing, and filters and cycles', () => {
    const g = newGame(CATALOG[0]);
    const i = emptyCell(g); at(g, i); place(g, 5);
    setFilters(g, 'all', 'all');
    expect(next(g)).toBe(CATALOG.length > 1);       // one puzzle: nothing else to open
    choose(g, legacyId(2));
    expect(g.puzzleId).toBe(legacyId(2));
    choose(g, CATALOG[0].id);
    expect(boardOf(g).cells[i]).toBe(5);
    expect(choose(g, 'unknown')).toBe(false);
    expect(g.puzzleId).toBe(CATALOG[0].id);
    expect(choose(g, 'custom-' + '1'.repeat(81))).toBe(false);   // not a puzzle: it has no solution
  });
  it('opens the first match when a filter excludes the open puzzle, and keeps it when nothing matches', () => {
    const g = newGame(CATALOG[0]);
    choose(g, legacyId(1));
    setFilters(g, 'classic', 'all');
    expect(g.puzzleId).toBe(CATALOG[0].id);        // an entered puzzle is not in the filtered list
    setFilters(g, 'killer', 'all');
    expect(g.puzzleId).toBe(CATALOG[0].id);        // no killer puzzle: stays
    setFilters(g, 'all', 'all');
  });
});

describe('saving and validated restore', () => {
  it('round-trips progress, notes, colors, mode, filters and the other puzzles\' boards', () => {
    const g = fresh();
    const i = emptyCell(g);
    at(g, i); toggleNote(g, 'corner', 2); toggleNote(g, 'center', 7); setColor(g, 5);
    at(g, emptyCell(g, 4)); place(g, 8);
    g.mode = 'center'; g.variant = 'classic'; g.difficulty = 'easy';
    const board = structuredClone(boardOf(g));
    choose(g, legacyId(2));
    const back = restore(serialize(g))!;
    expect(back.puzzleId).toBe(legacyId(2));
    expect(back.mode).toBe('center'); expect(back.variant).toBe('classic'); expect(back.difficulty).toBe('easy');
    choose(back, legacyId(1));
    expect(boardOf(back)).toEqual(board);
    expect(boardOf(back).corner[i]).toBe(2); expect(boardOf(back).colors[i]).toBe(5);
    expect(back.history).toEqual({});                                // history is not saved
  });
  it('rejects text that is not a save', () => {
    const base = JSON.parse(serialize(fresh()));
    for (const raw of [null, '', '{', '{}', 'null', '[]', '"x"', JSON.stringify({ ...base, version: 2 }), JSON.stringify({ ...base, version: 0 }),
      JSON.stringify({ ...base, boards: null }), JSON.stringify({ ...base, boards: [] }), JSON.stringify({ ...base, boards: 'x' })]) expect(restore(raw), String(raw)).toBeNull();
  });
  it('drops a board that does not hold up and keeps the others', () => {
    const g = fresh(1);
    const a = emptyCell(g); at(g, a); place(g, 3);
    choose(g, legacyId(2)); at(g, emptyCell(g)); place(g, 4);
    choose(g, legacyId(1));
    const base = JSON.parse(serialize(g));
    const one = legacyId(1), two = legacyId(2);
    const mutate = (id: string, f: (b: any) => void) => { const c = structuredClone(base); f(c.boards[id]); return JSON.stringify(c); };
    const given = puzzleOf(fresh(1)).givens.findIndex(Boolean);
    const filled = base.boards[one].cells.findIndex((n: number, i: number) => n && !puzzle(1).givens[i]);
    const bad: ((b: any) => void)[] = [
      b => { b.cells = []; }, b => { b.cells[0] = 10; }, b => { b.cells[0] = -1; }, b => { b.cells[0] = 1.5; }, b => { b.cells[0] = '1'; },
      b => { b.cells[given] = 0; }, b => { b.cells[given] = b.cells[given] % 9 + 1; },
      b => { b.corner = null; }, b => { b.corner[0] = 512; }, b => { b.center[0] = -1; }, b => { b.center = Array(80).fill(0); },
      b => { b.colors[0] = 7; }, b => { b.colors[0] = 'x'; },
      b => { b.selected = 81; }, b => { b.selected = -1; }, b => { b.selected = 1.5; }, b => { delete b.selected; },
      b => { b.corner[filled] = 1; },                              // notes under a number
      b => { b.center[filled] = 2; },
    ];
    for (const f of bad) {
      const back = restore(mutate(one, f))!;
      expect(back.boards[one], f.toString()).toBeDefined();         // the open puzzle gets a clean board
      expect(back.boards[two]).toBeDefined();
      expect(back.boards[one].cells.filter(Boolean).length).toBe(puzzle(1).givens.filter(Boolean).length);
    }
    const unknown = structuredClone(base); unknown.boards['no-such-puzzle'] = base.boards[one]; unknown.boards['custom-' + '1'.repeat(81)] = base.boards[one];
    expect(Object.keys(restore(JSON.stringify(unknown))!.boards).sort()).toEqual([one, two].sort());
  });
  it('falls back for a puzzle id the catalog no longer has, and for bad mode and filters', () => {
    const g = fresh(1); at(g, emptyCell(g)); place(g, 3);
    const base = JSON.parse(serialize(g));
    const lost = restore(JSON.stringify({ ...base, puzzleId: 'gone', mode: 'x', variant: 'x', difficulty: 7 }))!;
    expect(lost.puzzleId).toBe(legacyId(1));
    expect(lost.mode).toBe('value'); expect(lost.variant).toBe('all'); expect(lost.difficulty).toBe('all');
    const none = restore(JSON.stringify({ ...base, puzzleId: 4, boards: {} }))!;
    expect(puzzleOf(none)).toBe(CATALOG[0]);
    expect(boardOf(none).cells.filter(Boolean)).toHaveLength(puzzleOf(none).givens.filter(Boolean).length);
  });
  it('omits untouched puzzles from the save but keeps the open one', () => {
    const g = fresh(1);
    choose(g, legacyId(2)); choose(g, legacyId(3));
    expect(Object.keys(JSON.parse(serialize(g)).boards)).toEqual([legacyId(3)]);
  });
  it('loads the save, else starts new', () => {
    const saved = serialize(fresh(9));
    expect(load(saved).puzzleId).toBe(legacyId(9));
    expect(load(null).puzzleId).toBe(CATALOG[0].id);
    expect(load('garbage').boards).toBeDefined();
    expect(load('garbage').puzzleId).toBe(CATALOG[0].id);
    expect(STORAGE_KEY).toBe('zensudoku.v1');
  });
});
