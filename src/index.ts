import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[filesystem-mcp] Config error: ${message}\n`);
    process.exit(1);
  }

  process.stderr.write(
    `[filesystem-mcp] Starting. root=${config.root} allowWrite=${config.allowWrite}\n`
  );

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
