// What the app needs from its surroundings, kept small so another shell can supply its own.
// Storage: where progress lives (the PWA: localStorage; a host's iframe: localStorage when the
// sandbox allows it, else memory). SudokuPad sources: the puzzles opened from the library or imported,
// kept beside the progress so a saved board can be restored. The library: where the picker's list comes
// from (the server in a host, the imports in the PWA). The AI adapter does not exist yet (v0: none).
import { STORAGE_KEY } from '../core/sudoku-game.ts';
import { findPuzzle } from '../core/sudoku.ts';
import type { LibraryInfo } from '../core/sudoku.ts';

export const SOURCES_KEY = 'zensudoku.sources.v1';

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

/** A SudokuPad puzzle the app has opened, kept so its saved board can be restored. */
export interface SourceEntry { id: string; source: string; library?: LibraryInfo }
export interface SourceStore { get(id: string): SourceEntry | undefined; all(): SourceEntry[]; add(e: SourceEntry): void }
const MAX_SOURCES = 200, MAX_SOURCE_BYTES = 3_000_000;

/** The sources the app has opened, newest last, in localStorage when it can (else for this page only). */
export function sourceStorage(key: string = SOURCES_KEY): SourceStore {
  const store = browserStorage(key);
  let list: SourceEntry[] = [];
  try {
    const x = JSON.parse(store.read() ?? 'null');
    if (x?.version === 1 && Array.isArray(x.puzzles))
      list = x.puzzles.filter((e: SourceEntry) => e && typeof e.id === 'string' && typeof e.source === 'string' && e.id.length <= 120).slice(-MAX_SOURCES);
  } catch { list = []; }
  return {
    get: id => list.find(e => e.id === id),
    all: () => [...list],
    add(e) {
      list = [...list.filter(x => x.id !== e.id), e];
      while (list.length > MAX_SOURCES || (list.length > 1 && JSON.stringify(list).length > MAX_SOURCE_BYTES)) list.shift();
      store.write(JSON.stringify({ version: 1, puzzles: list }));
    },
  };
}

/** One line of the library picker. `puzzleId` is the game's id; `id` the library's (or the import's). */
export interface LibraryItem extends LibraryInfo { puzzleId: string }
/** What the picker lists: the local library (`available`) or, without one, the imported puzzles. */
export interface LibraryList { available: boolean; entries: LibraryItem[]; errors: number }
/** Where the picker gets its list and a puzzle's source: the plugin's server, or the browser's imports. */
export interface LibrarySource {
  list(): Promise<LibraryList>;
  /** The source of a listed puzzle that the app has not opened yet. */
  source(item: LibraryItem): Promise<SourceEntry | string>;
}

/** The PWA's library: only what was imported on this device. */
export function importedLibrary(sources: SourceStore): LibrarySource {
  return {
    list: async () => ({ available: false, errors: 0, entries: sources.all().filter(e => !e.library).reverse().map(e => {
      const p = findPuzzle(e.id);
      return { puzzleId: e.id, id: e.id, collection: 'Imported', title: p?.name ?? e.id, author: p?.pad?.author || undefined };
    }) }),
    source: async item => sources.get(item.puzzleId) ?? 'This puzzle is no longer stored here.',
  };
}
