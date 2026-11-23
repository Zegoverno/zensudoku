import { describe, expect, it } from 'vitest';
import { CATALOG, padPuzzle, playVerdict } from './sudoku.ts';
import { boardOf, choose, completeAttempt, newGame, restart, restore, serialize } from './sudoku-game.ts';
import { matchesSolveFilter, newPlayTime, playClock } from './play-time.ts';

const grid = [...'1234341221434321'].map(Number);
function tiny({ line = false, key, rules }: { line?: boolean; key?: string; rules?: string }) {
  const p = padPuzzle(JSON.stringify({
    cells: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({}))),
    regions: [[[0,0],[0,1],[1,0],[1,1]], [[0,2],[0,3],[1,2],[1,3]], [[2,0],[2,1],[3,0],[3,1]], [[2,2],[2,3],[3,2],[3,3]]],
    ...(line ? { lines: [{ wayPoints: [[.5,.5],[1.5,1.5]], color: '#ccc', thickness: 10 }] } : {}),
    metadata: { solution: key, rules },
  }));
  if (typeof p === 'string') throw new Error(p);
  return p;
}

describe('play time', () => {
  it('resumes from persisted elapsed time, ignores hidden/closed periods and switches attempts independently', () => {
    let now = 1000;
    const clock = playClock(() => now), game = newGame(), first = boardOf(game).play;
    clock.sync(first);
    now += 3000; clock.sync(first); // selection, save, rerender
    now += 2000; clock.sync(); // hidden
    now += 60_000;
    expect(clock.elapsed(first)).toBe(5000);
    const restored = restore(serialize(game))!, next = boardOf(restored).play;
    const reopened = playClock(() => now);
    reopened.sync(next);
    now += 1500;
    expect(reopened.elapsed(next)).toBe(6500);
    const different = newPlayTime();
    reopened.sync(different);
    now += 4000;
    reopened.sync(next);
    expect(reopened.elapsed(next)).toBe(6500);
    expect(different.elapsedMs).toBe(4000);
  });

  it('records the minimum once per attempt, preserves the badge/record on restart and persists a blank restarted board', () => {
    const g = newGame(), p = CATALOG[0];
    for (const ms of [14000, 22000, 10000]) {
      const board = boardOf(g);
      board.cells = [...p.solution];
      board.play.elapsedMs = ms;
      expect(completeAttempt(g)).toBe(true);
      expect(completeAttempt(g)).toBe(false);
      expect(board.play.bestMs).toBe(ms === 22000 ? 14000 : ms);
      const clock = playClock(() => 30_000);
      clock.sync(board.play);
      expect(clock.elapsed(board.play)).toBe(ms);
      restart(g);
      expect(boardOf(g).play).toEqual({ ...newPlayTime(), solved: true, bestMs: ms === 22000 ? 14000 : ms });
      expect(boardOf(g).cells).toEqual(p.givens);
    }
    choose(g, tiny({ key: grid.join('') }).id);
    expect(restore(serialize(g))!.boards[p.id].play.bestMs).toBe(10000);
  });

  it('never invents an elapsed record for an old save, even when finishing a legacy attempt', () => {
    const g = newGame(), p = CATALOG[0], raw = JSON.parse(serialize(g));
    const b = raw.boards[p.id]; delete b.play;
    b.cells = [...p.solution];
    expect(boardOf(restore(JSON.stringify(raw))!).play).toMatchObject({ solved: true, finished: true, bestMs: null, timed: false });
    b.cells[p.givens.indexOf(0)] = 0;
    const legacy = restore(JSON.stringify(raw))!;
    boardOf(legacy).cells = [...p.solution];
    expect(completeAttempt(legacy)).toBe(true);
    expect(boardOf(legacy).play.bestMs).toBeNull();
    restart(legacy);
    expect(boardOf(legacy).play.timed).toBe(true);
  });

  it('requires a proven answer or a user confirmation of a full, unverified variant', () => {
    const exact = tiny({ key: grid.join(''), line: true }), variant = tiny({ line: true });
    const g = newGame(exact);
    const b = boardOf(g);
    expect(completeAttempt(g, true)).toBe(false);
    b.cells = [...grid];
    expect(completeAttempt(g)).toBe(true);
    choose(g, variant.id);
    expect(completeAttempt(g, true)).toBe(false);
    boardOf(g).cells = [...grid];
    expect(completeAttempt(g)).toBe(false);
    expect(boardOf(g).play.solved).toBe(false);
    expect(completeAttempt(g, true)).toBe(true);
    expect(playVerdict(grid, tiny({ key: grid.join('').replace(/^./, '?') }))).toBe('full');
    // Rule text can introduce a variant even in the absence of markings.
    expect(playVerdict(grid, tiny({ rules: 'Additional rules apply.' }))).toBe('full');
  });

  it('filters by lifetime solved status', () => {
    expect([false, true].filter(x => matchesSolveFilter('all', x))).toEqual([false, true]);
    expect([false, true].filter(x => matchesSolveFilter('solved', x))).toEqual([true]);
    expect([false, true].filter(x => matchesSolveFilter('unsolved', x))).toEqual([false]);
  });
});
