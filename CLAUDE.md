# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # compile with tsup → dist/index.js
npm run dev          # watch mode build
npm run lint         # TypeScript type-check (no emit)
npm test             # run all tests once (vitest)
npm run test:watch   # vitest in watch mode
npm start            # run the built server (requires a config file)
```

Run a single test file:
```bash
npx vitest run src/security/path-guard.test.ts
```

## Configuration

The server looks for `filesystem-mcp.json` in the working directory, or a custom path via `--config`:

```bash
node dist/index.js --config /path/to/filesystem-mcp.json
```

Copy `filesystem-mcp.example.json` as a starting point.

## Architecture

### Entry point flow

`src/index.ts` → `loadConfig()` → `createServer(config)` → `server.connect(StdioServerTransport)`

### Security choke point — `src/security/path-guard.ts`

**All filesystem I/O must go through `guardPath` or `guardFilePath` first.** These functions:
- Resolve the user-supplied relative path against `config.root`
- Reject anything that resolves outside the root (traversal, symlink escapes)
- Check against `config.excludePatterns` (via micromatch)
- `guardFilePath` additionally enforces `config.maxFileSizeBytes` and asserts the path is a file

Tools must never call `path.resolve` or `fs.*` directly on user input.

### Tool module pattern

Each tool file exports a `ToolModule`:
```ts
export const myTool: ToolModule = {
  definition: { name, description, inputSchema },  // JSON Schema
  handler: async (args, ctx) => ToolResult,
};
```

`src/server.ts` collects all tools, registers read tools always and write tools only when `config.allowWrite` is `true`. It wires `ListToolsRequestSchema` and `CallToolRequestSchema` handlers using the low-level MCP `Server` class (not `McpServer`) so plain JSON Schema input schemas are supported.

### Adding a new tool

1. Create `src/tools/my-tool.ts` following the `ToolModule` pattern
2. Parse and validate `args` with a Zod schema at the top of `handler` — return `errorResult(...)` on failure
3. Call `guardPath` / `guardFilePath` before any I/O
4. Add the export to `READ_TOOLS` or `WRITE_TOOLS` in `src/server.ts`

### Transport

stdio only. Logs go to `stderr`; all MCP protocol traffic goes through `stdout`/`stdin`. Never write to `stdout` outside the MCP transport.

## Claude Desktop / Claude Code integration

Add to your MCP config:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/filesystem-mcp/dist/index.js", "--config", "/path/to/filesystem-mcp.json"]
    }
  }
}
```
