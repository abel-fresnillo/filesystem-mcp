import { rename, mkdir } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
  createParents: z.boolean().default(true),
});

export const moveFileTool: ToolModule = {
  definition: {
    name: "move_file",
    description:
      "Move or rename a file or directory within the allowed root. " +
      "Both source and destination must be inside the root. " +
      "Only available when allowWrite is enabled.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Current path relative to the configured root",
        },
        destination: {
          type: "string",
          description: "Target path relative to the configured root",
        },
        createParents: {
          type: "boolean",
          default: true,
          description: "Create parent directories of the destination if missing",
        },
      },
      required: ["source", "destination"],
    },
  },

  async handler(args, ctx) {
    const parsed = InputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Invalid arguments: ${parsed.error.message}`);
    }
    const { source, destination, createParents } = parsed.data;

    try {
      const safeSrc = guardPath(source, ctx.config);
      const safeDst = guardPath(destination, ctx.config);

      if (createParents) {
        await mkdir(dirname(safeDst), { recursive: true });
      }

      await rename(safeSrc, safeDst);
      return textResult(`Moved ${source} → ${destination}`);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
