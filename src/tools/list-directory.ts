import { readdir, stat } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  path: z.string().default(""),
  recursive: z.boolean().default(false),
});

interface Entry {
  name: string;
  type: "file" | "directory";
  sizeBytes?: number;
  modifiedAt: string;
}

export const listDirectoryTool: ToolModule = {
  definition: {
    name: "list_directory",
    description:
      "List files and directories at the given path within the allowed root. " +
      "Set recursive to true to traverse subdirectories.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to the configured root (default: root itself)",
          default: "",
        },
        recursive: {
          type: "boolean",
          description: "Recurse into subdirectories",
          default: false,
        },
      },
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
      const entries = await collectEntries(safePath, safePath, recursive, ctx.config);
      return textResult(JSON.stringify(entries, null, 2));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

async function collectEntries(
  dirPath: string,
  rootPath: string,
  recursive: boolean,
  config: import("../config.js").Config
): Promise<Entry[]> {
  const names = await readdir(dirPath);
  const entries: Entry[] = [];

  for (const name of names) {
    const full = join(dirPath, name);
    const relative = full.slice(rootPath.length + 1);

    // Reuse path guard's exclude check by attempting to guard the path
    try {
      guardPath(relative, { ...config, root: rootPath });
    } catch {
      continue;
    }

    const info = await stat(full);
    const entry: Entry = {
      name: full.slice(config.root.length + 1),
      type: info.isDirectory() ? "directory" : "file",
      modifiedAt: info.mtime.toISOString(),
    };
    if (info.isFile()) entry.sizeBytes = info.size;
    entries.push(entry);

    if (recursive && info.isDirectory()) {
      const children = await collectEntries(full, rootPath, true, config);
      entries.push(...children);
    }
  }

  return entries;
}
