// The reactive game: core's plain Game object wrapped in $state, saved through a StorageAdapter. The
// SudokuPad sources the app has opened are kept in a SourceStore, and findPuzzle reads them back, so a
// saved library or imported board restores like any other.
import { load, serialize } from '../core/sudoku-game.ts';
import type { Game } from '../core/sudoku-game.ts';
import { padPuzzle, setPuzzleResolver } from '../core/sudoku.ts';
import { sourceStorage } from './adapters.ts';
import type { SourceStore, StorageAdapter } from './adapters.ts';

export interface Store { game: Game; save(): void; sources: SourceStore }
export function createStore(storage: StorageAdapter, sources: SourceStore = sourceStorage()): Store {
  setPuzzleResolver(id => {
    const e = sources.get(id), p = e && padPuzzle(e.source, e.library);
    return p && typeof p !== 'string' ? p : null;
  });
  const game: Game = $state(load(storage.read()));
  return { game, save: () => storage.write(serialize(game)), sources };
}
