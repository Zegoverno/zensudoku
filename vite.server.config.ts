// The MCP server: mcp/server.ts to ONE self-contained file, mcp/dist/server.js. Every dependency is bundled
// (ssr.noExternal), because an installed plugin has no node_modules and zenbot never runs npm.
import { defineConfig } from 'vite';

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'mcp/dist',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es', codeSplitting: false } },
  },
});
