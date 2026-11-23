// Attempt time is monotonic and only accumulated by the live view. No wall-clock
// timestamp is saved, so restoring cannot charge time spent away from the game.
export interface PlayTime {
  elapsedMs: number;
  timed: boolean; // false if part of this attempt predates timing
  finished: boolean;
  solved: boolean; // lifetime achievement, retained on restart
  bestMs: number | null;
}

export const newPlayTime = (): PlayTime => ({ elapsedMs: 0, timed: true, finished: false, solved: false, bestMs: null });
const validMs = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

export function restorePlayTime(value: unknown, legacyProgress: boolean, provenSolved: boolean): PlayTime {
  const x = value as Partial<PlayTime> | null;
  if (x && validMs(x.elapsedMs) && typeof x.timed === 'boolean' &&
      typeof x.finished === 'boolean' && typeof x.solved === 'boolean' &&
      (!x.finished || x.solved) && (x.bestMs === null || (x.solved && validMs(x.bestMs)))) {
    return { elapsedMs: x.elapsedMs, timed: x.timed, finished: x.finished, solved: x.solved, bestMs: x.bestMs };
  }
  return { ...newPlayTime(), timed: !legacyProgress && !provenSolved, finished: provenSolved, solved: provenSolved };
}

export function finishAttempt(play: PlayTime): boolean {
  if (play.finished) return false;
  play.finished = play.solved = true;
  if (play.timed) play.bestMs = Math.min(play.bestMs ?? Infinity, play.elapsedMs);
  return true;
}

/** The running segment is held outside reactive/persisted state. Switching attempts
 * checkpoints the outgoing one; repeated syncs never restart the attempt. */
export function playClock(now: () => number) {
  let active: PlayTime | undefined, since = 0;
  const delta = (at: number) => Math.max(0, Math.floor(at - since));
  return {
    sync(next?: PlayTime): boolean {
      const at = Math.floor(now());
      const ms = active ? delta(at) : 0;
      if (active && ms && !active.finished) active.elapsedMs += ms;
      active = next?.finished ? undefined : next;
      since = at;
      return ms > 0;
    },
    elapsed(play: PlayTime): number {
      return play.elapsedMs + (active === play && !play.finished ? delta(now()) : 0);
    },
  };
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type SolveFilter = 'all' | 'solved' | 'unsolved';
export const matchesSolveFilter = (filter: SolveFilter, solved: boolean) =>
  filter === 'all' || (filter === 'solved' ? solved : !solved);
