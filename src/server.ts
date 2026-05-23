import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import type { ToolModule, ToolContext } from "./types.js";

import { readFileTool } from "./tools/read-file.js";
import { listDirectoryTool } from "./tools/list-directory.js";
import { searchFilesTool } from "./tools/search-files.js";
import { searchContentTool } from "./tools/search-content.js";
import { writeFileTool } from "./tools/write-file.js";
import { createDirectoryTool } from "./tools/create-directory.js";
import { deleteFileTool } from "./tools/delete-file.js";
import { moveFileTool } from "./tools/move-file.js";

const READ_TOOLS: ToolModule[] = [
  readFileTool,
  listDirectoryTool,
  searchFilesTool,
  searchContentTool,
];

const WRITE_TOOLS: ToolModule[] = [
  writeFileTool,
  createDirectoryTool,
  deleteFileTool,
  moveFileTool,
];

export function createServer(config: Config): Server {
  const server = new Server(
    { name: "filesystem-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const ctx: ToolContext = { config };
  const tools = config.allowWrite
    ? [...READ_TOOLS, ...WRITE_TOOLS]
    : READ_TOOLS;

  const toolIndex = new Map<string, ToolModule>(
    tools.map((t) => [t.definition.name, t])
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      inputSchema: t.definition.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolIndex.get(req.params.name);
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${req.params.name}`
      );
    }
    return tool.handler(req.params.arguments, ctx);
  });

  return server;
}
