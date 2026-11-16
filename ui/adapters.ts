// What the app needs from its surroundings, kept small so another shell can supply its own.
// Storage: where progress lives (the PWA: localStorage; a host's iframe: localStorage when the
// sandbox allows it, else memory). The AI adapter does not exist yet (v0: none).
import { STORAGE_KEY } from '../core/sudoku-game.ts';

export interface StorageAdapter {
  read(): string | null;
  write(text: string): void;
}

/** Progress that lasts while the page is open. */
export function memoryStorage(): StorageAdapter {
  let held: string | null = null;
  return { read: () => held, write: text => { held = text; } };
}

/** localStorage under one key; an unavailable or full store (private mode, a sandboxed frame) falls back to memory. */
export function browserStorage(key: string = STORAGE_KEY): StorageAdapter {
  const memory = memoryStorage();
  return {
    read() { try { return localStorage.getItem(key) ?? memory.read(); } catch { return memory.read(); } },
    write(text) { memory.write(text); try { localStorage.setItem(key, text); } catch { /* private mode / quota / sandbox */ } },
  };
}

/** What the app reports to a host about the open board. */
export interface Snapshot { puzzleId: string; name: string; givens: string; cells: string; selected: number }
