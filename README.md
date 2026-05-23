# filesystem-mcp

An MCP (Model Context Protocol) server that gives AI assistants controlled, secure access to local files. Built with TypeScript for use with Claude Desktop, Claude Code, or any MCP-compatible client.

## Features

- **Read tools**: read files, list directories, search by glob pattern, search file contents
- **Write tools**: write/append files, create directories, delete, move/rename (opt-in)
- **Security by default**: path traversal prevention, symlink blocking, file size limits, configurable exclude patterns
- **Configurable scope**: restrict access to a specific root directory via a JSON config file

## Installation

```bash
git clone https://github.com/abel-fresnillo/filesystem-mcp.git
cd filesystem-mcp
npm install
npm run build
```

## Configuration

Copy the example config and edit it:

```bash
cp filesystem-mcp.example.json filesystem-mcp.json
```

```json
{
  "root": "/path/to/your/directory",
  "allowWrite": false,
  "maxFileSizeBytes": 10485760,
  "excludePatterns": [".git", "node_modules", ".env*", "*.pem", "*.key"],
  "followSymlinks": false
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `root` | `string` | — | **Required.** Absolute path the server is allowed to access |
| `allowWrite` | `boolean` | `false` | Enable write tools (write_file, create_directory, delete_file, move_file) |
| `maxFileSizeBytes` | `number` | `10485760` | Maximum file size for reads (10 MB) |
| `excludePatterns` | `string[]` | see example | Glob patterns to block; matched against each path segment |
| `followSymlinks` | `boolean` | `false` | Allow symbolic links (disabled by default for security) |

## Claude Desktop / Claude Code setup

Add the server to your MCP configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": [
        "/path/to/filesystem-mcp/dist/index.js",
        "--config",
        "/path/to/filesystem-mcp.json"
      ]
    }
  }
}
```

For Claude Desktop this is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS.  
For Claude Code, add it to your project's `.claude/mcp.json` or run `claude mcp add`.

## Available tools

### Read tools (always enabled)

| Tool | Description |
|---|---|
| `read_file` | Read file contents. Supports `utf-8` or `base64` encoding and optional `startLine`/`endLine` for large files |
| `list_directory` | List files and directories with name, type, size, and modified date. Optional `recursive` flag |
| `search_files` | Find files by glob pattern, e.g. `**/*.ts`. Case sensitivity configurable |
| `search_content` | Search inside file contents with a string or regex. Returns file path, line number, and matched text |

### Write tools (requires `allowWrite: true`)

| Tool | Description |
|---|---|
| `write_file` | Write or append to a file. Creates parent directories automatically |
| `create_directory` | Create a directory tree (`mkdir -p`) |
| `delete_file` | Delete a file or directory. Requires `recursive: true` for non-empty directories |
| `move_file` | Move or rename a file or directory. Both paths must be within the root |

## Security model

All filesystem access is routed through a single path guard before any I/O:

1. The requested path is resolved relative to `root` and checked to not escape it — this blocks `../` traversal and similar techniques
2. Symbolic links are rejected unless `followSymlinks` is enabled
3. Each path segment is checked against `excludePatterns` — this blocks access to `.git`, `node_modules`, secrets, and certificates anywhere in the tree
4. File reads are rejected if the file exceeds `maxFileSizeBytes`
5. Write tools are entirely absent from the server when `allowWrite` is `false` — they are not registered, not just disabled

## Development

```bash
npm run build        # compile → dist/
npm run dev          # watch mode
npm run lint         # TypeScript type-check
npm test             # run tests
npm run test:watch   # tests in watch mode
```

Run a single test file:
```bash
npx vitest run src/security/path-guard.test.ts
```
