import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { readFileTool } from "../../src/tools/read-file.js";
import type { Config } from "../../src/config.js";
import type { ToolContext } from "../../src/types.js";

const TMP = join(process.cwd(), "tmp-test-read-file");

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
  writeFileSync(join(TMP, "hello.txt"), "line1\nline2\nline3\nline4\nline5");
  writeFileSync(join(TMP, "empty.txt"), "");
  // Write a known binary file (3 bytes: 0x00 0x01 0x02)
  writeFileSync(join(TMP, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
  // Excluded file
  writeFileSync(join(TMP, ".env"), "SECRET=abc");
  // Oversized file
  writeFileSync(join(TMP, "huge.txt"), "x".repeat(10));
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("readFileTool.handler", () => {
  it("reads full file content", async () => {
    const result = await readFileTool.handler({ path: "hello.txt" }, makeCtx());
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("line1\nline2\nline3\nline4\nline5");
  });

  it("returns a line slice with startLine and endLine", async () => {
    const result = await readFileTool.handler(
      { path: "hello.txt", startLine: 2, endLine: 4 },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("line2\nline3\nline4");
  });

  it("uses startLine alone (reads to end of file)", async () => {
    const result = await readFileTool.handler(
      { path: "hello.txt", startLine: 4 },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("line4\nline5");
  });

  it("uses endLine alone (reads from beginning)", async () => {
    const result = await readFileTool.handler(
      { path: "hello.txt", endLine: 2 },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("line1\nline2");
  });

  it("returns base64 content when encoding is base64", async () => {
    const result = await readFileTool.handler(
      { path: "binary.bin", encoding: "base64" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    // Buffer.from([0,1,2]).toString("base64") === "AAEC"
    expect(result.content[0].text).toBe("AAEC");
  });

  it("returns isError when file does not exist", async () => {
    const result = await readFileTool.handler(
      { path: "nonexistent.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError when path escapes root (traversal)", async () => {
    const result = await readFileTool.handler(
      { path: "../outside.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError when file matches an excluded pattern", async () => {
    const result = await readFileTool.handler({ path: ".env" }, makeCtx());
    expect(result.isError).toBe(true);
  });

  it("returns isError when file exceeds maxFileSizeBytes", async () => {
    const result = await readFileTool.handler(
      { path: "huge.txt" },
      makeCtx({ maxFileSizeBytes: 5 }) // file is 10 bytes
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError for invalid arguments", async () => {
    const result = await readFileTool.handler({ path: "" }, makeCtx());
    expect(result.isError).toBe(true);
  });
});
