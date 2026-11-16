// The PWA entry: the Sudoku UI with browser storage, and a service worker for offline play.
import { mount } from 'svelte';
import '../../ui/app.css';
import Sudoku from '../../ui/Sudoku.svelte';
import { browserStorage } from '../../ui/adapters.ts';
import { createStore } from '../../ui/state.svelte.ts';

mount(Sudoku, { target: document.getElementById('app')!, props: { store: createStore(browserStorage()) } });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
