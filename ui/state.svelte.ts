// The reactive game: core's plain Game object wrapped in $state, saved through a StorageAdapter.
import { load, serialize } from '../core/sudoku-game.ts';
import type { Game } from '../core/sudoku-game.ts';
import type { StorageAdapter } from './adapters.ts';

export interface Store { game: Game; save(): void }
export function createStore(storage: StorageAdapter): Store {
  const game: Game = $state(load(storage.read()));
  return { game, save: () => storage.write(serialize(game)) };
}
