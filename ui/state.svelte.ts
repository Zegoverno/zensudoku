// The reactive game: core's plain Game object wrapped in $state, saved through a StorageAdapter. The
// SudokuPad sources the app has opened are kept in a SourceStore, and findPuzzle reads them back, so a
// saved library or imported board restores like any other.
import { boardOf, completeAttempt, load, serialize } from '../core/sudoku-game.ts';
import { playClock } from '../core/play-time.ts';
import type { Game } from '../core/sudoku-game.ts';
import { padPuzzle, setPuzzleResolver } from '../core/sudoku.ts';
import { sourceStorage } from './adapters.ts';
import type { SourceStore, StorageAdapter } from './adapters.ts';

export interface Store {
  game: Game;
  save(confirmed?: boolean): void;
  elapsed(): number;
  setPlaying(playing: boolean): void;
  checkpoint(): void;
  sources: SourceStore;
}
export function createStore(storage: StorageAdapter, sources: SourceStore = sourceStorage()): Store {
  setPuzzleResolver(id => {
    try {
      const e = sources.get(id), p = e && padPuzzle(e.source, e.library);
      return p && typeof p !== 'string' && p.id === id ? p : null;
    } catch { return null; }
  });
  const game: Game = $state(load(storage.read()));
  const clock = playClock(() => performance.now());
  let playing = false;
  const persist = () => storage.write(serialize(game));
  return {
    game, sources,
    save(confirmed = false) {
      const play = boardOf(game).play;
      clock.sync(playing ? play : undefined);
      if (completeAttempt(game, confirmed)) clock.sync();
      persist();
    },
    elapsed: () => clock.elapsed(boardOf(game).play),
    setPlaying(next) {
      if (next === playing) return;
      playing = next;
      if (clock.sync(playing ? boardOf(game).play : undefined)) persist();
    },
    checkpoint() {
      if (playing && clock.sync(boardOf(game).play)) persist();
    },
  };
}
