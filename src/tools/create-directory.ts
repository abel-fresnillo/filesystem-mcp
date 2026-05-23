import { mkdir } from "fs/promises";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  path: z.string().min(1),
});

export const createDirectoryTool: ToolModule = {
  definition: {
    name: "create_directory",
    description:
      "Create a directory (and any missing parent directories) within the allowed root. " +
      "Only available when allowWrite is enabled.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the configured root directory",
        },
      },
      required: ["path"],
    },
  },

  async handler(args, ctx) {
    const parsed = InputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Invalid arguments: ${parsed.error.message}`);
    }
    const { path } = parsed.data;

    try {
      const safePath = guardPath(path, ctx.config);
      await mkdir(safePath, { recursive: true });
      return textResult(`Directory created: ${path}`);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
