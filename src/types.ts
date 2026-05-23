import type { Config } from "./config.js";

export interface ToolContext {
  config: Config;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolModule {
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
