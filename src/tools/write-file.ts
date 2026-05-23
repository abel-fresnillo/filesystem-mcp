import { writeFile, appendFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  mode: z.enum(["overwrite", "append"]).default("overwrite"),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
  createParents: z.boolean().default(true),
});

export const writeFileTool: ToolModule = {
  definition: {
    name: "write_file",
    description:
      "Write or append content to a file within the allowed root. " +
      "Creates parent directories automatically unless createParents is false. " +
      "Only available when allowWrite is enabled.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the configured root directory",
        },
        content: {
          type: "string",
          description: "Content to write (utf-8 string or base64 encoded bytes)",
        },
        mode: {
          type: "string",
          enum: ["overwrite", "append"],
          default: "overwrite",
          description: "Whether to overwrite or append to an existing file",
        },
        encoding: {
          type: "string",
          enum: ["utf-8", "base64"],
          default: "utf-8",
          description: "Encoding of the content field",
        },
        createParents: {
          type: "boolean",
          default: true,
          description: "Create parent directories if they do not exist",
        },
      },
      required: ["path", "content"],
    },
  },

  async handler(args, ctx) {
    const parsed = InputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Invalid arguments: ${parsed.error.message}`);
    }
    const { path, content, mode, encoding, createParents } = parsed.data;

    try {
      const safePath = guardPath(path, ctx.config);

      if (createParents) {
        await mkdir(dirname(safePath), { recursive: true });
      }

      const data =
        encoding === "base64" ? Buffer.from(content, "base64") : content;

      if (mode === "append") {
        await appendFile(safePath, data);
      } else {
        await writeFile(safePath, data);
      }

      return textResult(`Successfully wrote to ${path}`);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
