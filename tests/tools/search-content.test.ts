import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { searchContentTool } from "../../src/tools/search-content.js";
import type { Config } from "../../src/config.js";
import type { ToolContext } from "../../src/types.js";

const TMP = join(process.cwd(), "tmp-test-search-content");

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
  mkdirSync(join(TMP, "node_modules"), { recursive: true });

  writeFileSync(
    join(TMP, "alpha.txt"),
    "hello world\nfoo bar\nHello Again\nbaz"
  );
  writeFileSync(
    join(TMP, "src", "beta.ts"),
    "const x = 1;\nconst y = 2;\nconst z = 3;"
  );
  writeFileSync(
    join(TMP, "src", "gamma.ts"),
    "function greet() {}\ngreet();\nconst greeting = 'hi';"
  );
  writeFileSync(join(TMP, "node_modules", "excluded.js"), "hello world");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("searchContentTool.handler", () => {
  it("returns file:line: matched text for matching lines", async () => {
    const result = await searchContentTool.handler(
      { query: "hello" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Should match "hello world" in alpha.txt (case-insensitive default)
    expect(text).toContain("hello world");
    // Output format: file:line: text
    expect(text).toMatch(/alpha\.txt:\d+:/);
  });

  it("returns 'No matches found.' when nothing matches", async () => {
    const result = await searchContentTool.handler(
      { query: "zzznomatch" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("No matches found.");
  });

  it("does case-insensitive matching by default (caseSensitive: false)", async () => {
    const result = await searchContentTool.handler(
      { query: "hello", caseSensitive: false },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Both "hello world" (line 1) and "Hello Again" (line 3) should match
    expect(text).toContain("hello world");
    expect(text).toContain("Hello Again");
  });

  it("does case-sensitive matching when caseSensitive: true", async () => {
    const result = await searchContentTool.handler(
      { query: "Hello", caseSensitive: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // "Hello Again" should match, but not "hello world"
    expect(text).toContain("Hello Again");
    expect(text).not.toContain("hello world");
  });

  it("treats query as regex when isRegex: true", async () => {
    const result = await searchContentTool.handler(
      { query: "const [xyz] = \\d+", isRegex: true, caseSensitive: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).not.toBe("No matches found.");
    // All three const lines in beta.ts should match
    const matchCount = (text.match(/beta\.ts/g) ?? []).length;
    expect(matchCount).toBe(3);
  });

  it("respects maxResults cap", async () => {
    const result = await searchContentTool.handler(
      { query: "const", maxResults: 2 },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).not.toBe("No matches found.");
    // Should mention the cap
    expect(text).toContain("showing first 2 results");
    // Count actual result lines (lines with "file:line:" pattern)
    const matchLines = text
      .split("\n")
      .filter((l) => /\w+:\d+:/.test(l));
    expect(matchLines.length).toBeLessThanOrEqual(2);
  });

  it("restricts search to files matching filePattern", async () => {
    const result = await searchContentTool.handler(
      { query: "const", filePattern: "**/*.ts" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).not.toBe("No matches found.");
    // Only .ts files should appear, not alpha.txt
    expect(text).not.toContain("alpha.txt");
    expect(text.split("\n").some((l) => l.includes(".ts"))).toBe(true);
  });

  it("skips excluded patterns (node_modules)", async () => {
    const result = await searchContentTool.handler(
      { query: "hello" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    // node_modules files should never appear in results
    expect(result.content[0].text).not.toContain("node_modules");
  });

  it("returns isError for invalid arguments (empty query)", async () => {
    const result = await searchContentTool.handler({ query: "" }, makeCtx());
    expect(result.isError).toBe(true);
  });

  it("returns isError when path escapes root", async () => {
    const result = await searchContentTool.handler(
      { query: "hello", path: "../.." },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});
