// The PWA entry: the Sudoku UI with browser storage, and a service worker for offline play. There is no
// server here, so the Library lists the SudokuPad puzzles imported on this device.
import { mount } from 'svelte';
import '../../ui/app.css';
import Sudoku from '../../ui/Sudoku.svelte';
import { browserStorage, importedLibrary } from '../../ui/adapters.ts';
import { createStore } from '../../ui/state.svelte.ts';

const store = createStore(browserStorage());
mount(Sudoku, { target: document.getElementById('app')!, props: { store, library: importedLibrary(store.sources), importer: true } });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
