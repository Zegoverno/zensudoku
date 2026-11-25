# Bundled Sudoku handbook
The diagram engine, palette and content started in the standalone Sudoku
techniques preview. This snapshot is part of zensudoku: no network access,
Preview server, or library puzzle files are needed at build or runtime.
The plugin adds a handbook entry for Samurai and exposes consecutive-line
rules so every built-in variant has a corresponding lesson.

Edit lesson content in `chapters.js` and `variants.js`, and keep lesson IDs
stable: `core/learning.ts` uses them for contextual navigation. The view
in `../Handbook.svelte` mounts one diagram at a time and stops its animation
when you leave the lesson. Browser tests cover the PWA and MCP App.
