import { rm, stat } from "fs/promises";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
});

export const deleteFileTool: ToolModule = {
  definition: {
    name: "delete_file",
    description:
      "Delete a file or directory within the allowed root. " +
      "Directories must be empty unless recursive is true. " +
      "Only available when allowWrite is enabled.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the configured root directory",
        },
        recursive: {
          type: "boolean",
          default: false,
          description: "Delete non-empty directories recursively",
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
    const { path, recursive } = parsed.data;

    try {
      const safePath = guardPath(path, ctx.config);

      // Guard against deleting the root itself
      if (safePath === ctx.config.root) {
        return errorResult("Deleting the root directory is not permitted.");
      }

      const info = await stat(safePath);
      await rm(safePath, {
        recursive: info.isDirectory() ? recursive : false,
        force: false,
      });

      return textResult(`Deleted: ${path}`);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
