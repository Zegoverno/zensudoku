// The MCP App: ui/ as one self-contained HTML file (ui/dist/index.html) that mcp/ serves as ui://sudoku/app.
import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'ui',
  plugins: [svelte({ preprocess: vitePreprocess() }), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
