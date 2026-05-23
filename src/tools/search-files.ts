import fg from "fast-glob";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";

const InputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().default(""),
  caseSensitive: z.boolean().default(true),
});

export const searchFilesTool: ToolModule = {
  definition: {
    name: "search_files",
    description:
      "Find files by glob pattern (e.g. '**/*.ts', 'src/**/*.test.*'). " +
      "Searches within the allowed root. Excluded patterns from config are always skipped.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match against file paths",
        },
        path: {
          type: "string",
          description: "Subdirectory to search within (default: root)",
          default: "",
        },
        caseSensitive: {
          type: "boolean",
          description: "Whether the match is case-sensitive",
          default: true,
        },
      },
      required: ["pattern"],
    },
  },

  async handler(args, ctx) {
    const parsed = InputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Invalid arguments: ${parsed.error.message}`);
    }
    const { pattern, path, caseSensitive } = parsed.data;

    try {
      const searchRoot = guardPath(path, ctx.config);

      const ignore = ctx.config.excludePatterns.map((p) => `**/${p}/**`).concat(
        ctx.config.excludePatterns.map((p) => `**/${p}`)
      );

      const matches = await fg(pattern, {
        cwd: searchRoot,
        caseSensitiveMatch: caseSensitive,
        ignore,
        followSymbolicLinks: ctx.config.followSymlinks,
        onlyFiles: false,
        dot: false,
      });

      if (matches.length === 0) {
        return textResult("No files matched the pattern.");
      }

      return textResult(matches.sort().join("\n"));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};
