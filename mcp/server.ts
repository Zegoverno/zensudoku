// stdio entry: `node mcp/dist/server.js`. The host starts it with cwd = the plugin folder.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './app.ts';

await createServer().connect(new StdioServerTransport());
