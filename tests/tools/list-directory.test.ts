import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { listDirectoryTool } from "../../src/tools/list-directory.js";
import type { Config } from "../../src/config.js";
import type { ToolContext } from "../../src/types.js";

const TMP = join(process.cwd(), "tmp-test-list-directory");

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
  mkdirSync(join(TMP, "subdir"), { recursive: true });
  mkdirSync(join(TMP, "subdir", "nested"), { recursive: true });
  mkdirSync(join(TMP, "node_modules"), { recursive: true });
  writeFileSync(join(TMP, "file-a.txt"), "aaa");
  writeFileSync(join(TMP, "file-b.txt"), "bbbb");
  writeFileSync(join(TMP, "subdir", "child.txt"), "child content");
  writeFileSync(join(TMP, "subdir", "nested", "deep.txt"), "deep");
  writeFileSync(join(TMP, "node_modules", "pkg.js"), "pkg");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("listDirectoryTool.handler", () => {
  it("lists the root when path is empty string", async () => {
    const result = await listDirectoryTool.handler({ path: "" }, makeCtx());
    expect(result.isError).toBeUndefined();

    const entries: Array<{ name: string; type: string }> = JSON.parse(
      result.content[0].text
    );
    const names = entries.map((e) => e.name);
    expect(names).toContain("file-a.txt");
    expect(names).toContain("file-b.txt");
    expect(names).toContain("subdir");
    // node_modules should be excluded
    expect(names).not.toContain("node_modules");
  });

  it("includes type field for each entry", async () => {
    const result = await listDirectoryTool.handler({ path: "" }, makeCtx());
    const entries: Array<{ name: string; type: string }> = JSON.parse(
      result.content[0].text
    );
    const fileEntry = entries.find((e) => e.name === "file-a.txt");
    const dirEntry = entries.find((e) => e.name === "subdir");
    expect(fileEntry?.type).toBe("file");
    expect(dirEntry?.type).toBe("directory");
  });

  it("includes sizeBytes for files but not directories", async () => {
    const result = await listDirectoryTool.handler({ path: "" }, makeCtx());
    const entries: Array<{
      name: string;
      type: string;
      sizeBytes?: number;
    }> = JSON.parse(result.content[0].text);
    const fileEntry = entries.find((e) => e.name === "file-a.txt");
    const dirEntry = entries.find((e) => e.name === "subdir");
    expect(typeof fileEntry?.sizeBytes).toBe("number");
    expect(fileEntry!.sizeBytes).toBeGreaterThan(0);
    expect(dirEntry?.sizeBytes).toBeUndefined();
  });

  it("includes modifiedAt as an ISO date string", async () => {
    const result = await listDirectoryTool.handler({ path: "" }, makeCtx());
    const entries: Array<{ name: string; modifiedAt: string }> = JSON.parse(
      result.content[0].text
    );
    const fileEntry = entries.find((e) => e.name === "file-a.txt");
    expect(fileEntry?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("lists a subdirectory by relative path", async () => {
    const result = await listDirectoryTool.handler(
      { path: "subdir" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const entries: Array<{ name: string }> = JSON.parse(result.content[0].text);
    const names = entries.map((e) => e.name);
    expect(names.some((n) => n.endsWith("child.txt"))).toBe(true);
  });

  it("traverses subdirectories when recursive is true", async () => {
    const result = await listDirectoryTool.handler(
      { path: "", recursive: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const entries: Array<{ name: string }> = JSON.parse(result.content[0].text);
    const names = entries.map((e) => e.name);
    // Deep file should appear
    expect(names.some((n) => n.includes("deep.txt"))).toBe(true);
  });

  it("skips entries matching excludePatterns", async () => {
    const result = await listDirectoryTool.handler(
      { path: "", recursive: true },
      makeCtx()
    );
    const entries: Array<{ name: string }> = JSON.parse(result.content[0].text);
    const names = entries.map((e) => e.name);
    // node_modules and anything inside it should be excluded
    expect(names.every((n) => !n.includes("node_modules"))).toBe(true);
  });

  it("returns isError when path escapes root", async () => {
    const result = await listDirectoryTool.handler(
      { path: "../.." },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});
