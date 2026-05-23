import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { searchFilesTool } from "../../src/tools/search-files.js";
import type { Config } from "../../src/config.js";
import type { ToolContext } from "../../src/types.js";

const TMP = join(process.cwd(), "tmp-test-search-files");

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    root: TMP,
    allowWrite: false,
    maxFileSizeBytes: 1024 * 1024,
    excludePatterns: [".git", "node_modules", ".env*"],
    followSymlinks: false,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<Config> = {}): ToolContext {
  return { config: makeConfig(overrides) };
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(join(TMP, "src"), { recursive: true });
  mkdirSync(join(TMP, "node_modules", "some-pkg"), { recursive: true });
  writeFileSync(join(TMP, "readme.md"), "# readme");
  writeFileSync(join(TMP, "src", "index.ts"), "export {}");
  writeFileSync(join(TMP, "src", "utils.ts"), "export {}");
  writeFileSync(join(TMP, "src", "README.MD"), "# inner readme");
  writeFileSync(join(TMP, "node_modules", "some-pkg", "index.js"), "module");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("searchFilesTool.handler", () => {
  it("returns matching file paths as newline-separated text", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*.ts" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const lines = result.content[0].text.split("\n");
    expect(lines.some((l) => l.includes("index.ts"))).toBe(true);
    expect(lines.some((l) => l.includes("utils.ts"))).toBe(true);
  });

  it("returns 'No files matched the pattern.' when nothing matches", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*.xyz" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("No files matched the pattern.");
  });

  it("respects caseSensitive: true (no match on wrong case)", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*.md", caseSensitive: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // readme.md should match; README.MD should NOT match on a case-sensitive fs
    // We just verify the result does not contain the upper-case name on case-sensitive match
    if (text !== "No files matched the pattern.") {
      const lines = text.split("\n");
      // All matched paths should end in .md (not .MD) when caseSensitive is true
      expect(lines.every((l) => l.endsWith(".md"))).toBe(true);
    }
  });

  it("respects caseSensitive: false (matches any casing)", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*.md", caseSensitive: false },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // At least readme.md should match
    expect(text).not.toBe("No files matched the pattern.");
    expect(text.split("\n").some((l) => l.includes("readme.md"))).toBe(true);
  });

  it("skips paths matching excludePatterns", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*.js" },
      makeCtx()
    );
    const text = result.content[0].text;
    // node_modules files should be excluded
    if (text !== "No files matched the pattern.") {
      expect(text.split("\n").every((l) => !l.includes("node_modules"))).toBe(
        true
      );
    } else {
      // No matches is also acceptable since node_modules are excluded
      expect(text).toBe("No files matched the pattern.");
    }
  });

  it("searches within a subdirectory when path is specified", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "*.ts", path: "src" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toBe("No files matched the pattern.");
    const lines = result.content[0].text.split("\n");
    expect(lines.some((l) => l.includes("index.ts"))).toBe(true);
  });

  it("returns isError when path escapes root", async () => {
    const result = await searchFilesTool.handler(
      { pattern: "**/*", path: "../.." },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError for missing required pattern argument", async () => {
    const result = await searchFilesTool.handler({}, makeCtx());
    expect(result.isError).toBe(true);
  });
});
