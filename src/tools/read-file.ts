import { readFile } from "fs/promises";
import { z } from "zod";
import { guardFilePath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  path: z.string().min(1),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

export const readFileTool: ToolModule = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file within the allowed root. " +
      "Optionally specify startLine/endLine (1-based) to read a slice of large files. " +
      "Use encoding 'base64' for binary files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the configured root directory",
        },
        encoding: {
          type: "string",
          enum: ["utf-8", "base64"],
          default: "utf-8",
          description: "Output encoding",
        },
        startLine: {
          type: "number",
          description: "First line to return (1-based, inclusive)",
        },
        endLine: {
          type: "number",
          description: "Last line to return (1-based, inclusive)",
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
    const { path, encoding, startLine, endLine } = parsed.data;

    try {
      const safePath = await guardFilePath(path, ctx.config);

      if (encoding === "base64") {
        const buf = await readFile(safePath);
        return textResult(buf.toString("base64"));
      }

      const content = await readFile(safePath, "utf-8");

      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split("\n");
        const from = (startLine ?? 1) - 1;
        const to = endLine ?? lines.length;
        const slice = lines.slice(from, to).join("\n");
        return textResult(slice);
      }

      return textResult(content);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
