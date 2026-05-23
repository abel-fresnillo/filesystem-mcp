import { createReadStream } from "fs";
import { createInterface } from "readline";
import fg from "fast-glob";
import { z } from "zod";
import { guardPath } from "../security/path-guard.js";
import { textResult, errorResult, type ToolModule } from "../types.js";
import type { Config } from "../config.js";

const InputSchema = z.object({
  query: z.string().min(1),
  path: z.string().default(""),
  isRegex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(500).default(50),
  filePattern: z.string().default("**/*"),
});

interface Match {
  file: string;
  line: number;
  text: string;
}

export const searchContentTool: ToolModule = {
  definition: {
    name: "search_content",
    description:
      "Search inside file contents for a string or regex pattern. " +
      "Returns matching file paths with line numbers and surrounding text. " +
      "Use filePattern to restrict which files are searched (e.g. '**/*.ts').",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search string or regular expression",
        },
        path: {
          type: "string",
          description: "Subdirectory to search within (default: root)",
          default: "",
        },
        isRegex: {
          type: "boolean",
          description: "Treat query as a regular expression",
          default: false,
        },
        caseSensitive: {
          type: "boolean",
          description: "Case-sensitive matching",
          default: false,
        },
        maxResults: {
          type: "number",
          description: "Maximum number of matching lines to return (max 500)",
          default: 50,
        },
        filePattern: {
          type: "string",
          description: "Glob pattern to filter which files are searched",
          default: "**/*",
        },
      },
      required: ["query"],
    },
  },

  async handler(args, ctx) {
    const parsed = InputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Invalid arguments: ${parsed.error.message}`);
    }
    const { query, path, isRegex, caseSensitive, maxResults, filePattern } =
      parsed.data;

    try {
      const searchRoot = guardPath(path, ctx.config);

      let pattern: RegExp;
      if (isRegex) {
        pattern = new RegExp(query, caseSensitive ? "" : "i");
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = new RegExp(escaped, caseSensitive ? "" : "i");
      }

      const ignore = ctx.config.excludePatterns
        .map((p) => `**/${p}/**`)
        .concat(ctx.config.excludePatterns.map((p) => `**/${p}`));

      const files = await fg(filePattern, {
        cwd: searchRoot,
        ignore,
        followSymbolicLinks: ctx.config.followSymlinks,
        onlyFiles: true,
        dot: false,
      });

      const results: Match[] = [];

      for (const file of files) {
        if (results.length >= maxResults) break;
        const filePath = `${searchRoot}/${file}`;
        const fileMatches = await searchFile(filePath, file, pattern, ctx.config);
        results.push(...fileMatches);
        if (results.length >= maxResults) {
          results.splice(maxResults);
          break;
        }
      }

      if (results.length === 0) {
        return textResult("No matches found.");
      }

      const output = results
        .map((m) => `${m.file}:${m.line}: ${m.text.trim()}`)
        .join("\n");
      const suffix =
        results.length === maxResults ? `\n(showing first ${maxResults} results)` : "";
      return textResult(output + suffix);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

async function searchFile(
  filePath: string,
  relPath: string,
  pattern: RegExp,
  config: Config
): Promise<Match[]> {
  const { size } = await import("fs/promises").then((m) =>
    m.stat(filePath)
  );
  // Skip files over the limit or binary-looking files
  if (size > config.maxFileSizeBytes) return [];

  const matches: Match[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (pattern.test(line)) {
      matches.push({ file: relPath, line: lineNum, text: line });
    }
  }
  return matches;
}
