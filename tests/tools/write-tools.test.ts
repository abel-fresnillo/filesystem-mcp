import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileTool } from "../../src/tools/write-file.js";
import { createDirectoryTool } from "../../src/tools/create-directory.js";
import { deleteFileTool } from "../../src/tools/delete-file.js";
import { moveFileTool } from "../../src/tools/move-file.js";
import type { Config } from "../../src/config.js";
import type { ToolContext } from "../../src/types.js";

// One top-level temp directory; each test gets a fresh sub-directory via beforeEach
const TMP_ROOT = join(process.cwd(), "tmp-test-write-tools");

let TMP: string;
let testCounter = 0;

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    root: TMP,
    allowWrite: true,
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
  mkdirSync(TMP_ROOT, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  testCounter++;
  TMP = join(TMP_ROOT, `test-${testCounter}`);
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

describe("writeFileTool.handler", () => {
  it("creates a new file with the given content", async () => {
    const result = await writeFileTool.handler(
      { path: "newfile.txt", content: "hello" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(readFileSync(join(TMP, "newfile.txt"), "utf-8")).toBe("hello");
  });

  it("overwrites an existing file (mode: overwrite)", async () => {
    writeFileSync(join(TMP, "existing.txt"), "original");
    const result = await writeFileTool.handler(
      { path: "existing.txt", content: "overwritten", mode: "overwrite" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(readFileSync(join(TMP, "existing.txt"), "utf-8")).toBe("overwritten");
  });

  it("appends to an existing file (mode: append)", async () => {
    writeFileSync(join(TMP, "appendable.txt"), "first");
    const result = await writeFileTool.handler(
      { path: "appendable.txt", content: " second", mode: "append" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(readFileSync(join(TMP, "appendable.txt"), "utf-8")).toBe(
      "first second"
    );
  });

  it("creates parent directories automatically (createParents: true)", async () => {
    const result = await writeFileTool.handler(
      { path: "deep/nested/dir/file.txt", content: "data", createParents: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "deep", "nested", "dir", "file.txt"))).toBe(
      true
    );
  });

  it("writes base64-encoded content correctly", async () => {
    // "hello" in base64 is "aGVsbG8="
    const result = await writeFileTool.handler(
      { path: "b64.bin", content: "aGVsbG8=", encoding: "base64" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    const written = readFileSync(join(TMP, "b64.bin"), "utf-8");
    expect(written).toBe("hello");
  });

  it("returns isError when path escapes root", async () => {
    const result = await writeFileTool.handler(
      { path: "../escape.txt", content: "bad" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// create_directory
// ---------------------------------------------------------------------------

describe("createDirectoryTool.handler", () => {
  it("creates a single directory", async () => {
    const result = await createDirectoryTool.handler(
      { path: "newdir" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "newdir"))).toBe(true);
  });

  it("creates nested directories recursively", async () => {
    const result = await createDirectoryTool.handler(
      { path: "a/b/c/d" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "a", "b", "c", "d"))).toBe(true);
  });

  it("succeeds when directory already exists (idempotent)", async () => {
    mkdirSync(join(TMP, "already"), { recursive: true });
    const result = await createDirectoryTool.handler(
      { path: "already" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
  });

  it("returns isError when path escapes root", async () => {
    const result = await createDirectoryTool.handler(
      { path: "../../escape" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

describe("deleteFileTool.handler", () => {
  it("deletes an existing file", async () => {
    writeFileSync(join(TMP, "todelete.txt"), "bye");
    const result = await deleteFileTool.handler(
      { path: "todelete.txt" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "todelete.txt"))).toBe(false);
  });

  it("deletes a non-empty directory when recursive: true", async () => {
    mkdirSync(join(TMP, "toremove", "child"), { recursive: true });
    writeFileSync(join(TMP, "toremove", "file.txt"), "content");
    const result = await deleteFileTool.handler(
      { path: "toremove", recursive: true },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "toremove"))).toBe(false);
  });

  it("returns isError when trying to delete a non-empty dir without recursive", async () => {
    mkdirSync(join(TMP, "nonempty"), { recursive: true });
    writeFileSync(join(TMP, "nonempty", "file.txt"), "content");
    const result = await deleteFileTool.handler(
      { path: "nonempty", recursive: false },
      makeCtx()
    );
    expect(result.isError).toBe(true);
    // Directory should still exist
    expect(existsSync(join(TMP, "nonempty"))).toBe(true);
  });

  it("returns isError when trying to delete root itself", async () => {
    // path "" resolves to root via guardPath but guardPath joins root + ""
    // The delete handler checks safePath === ctx.config.root
    // We use "." which resolves to root
    const result = await deleteFileTool.handler({ path: "." }, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("root");
  });

  it("returns isError when file does not exist", async () => {
    const result = await deleteFileTool.handler(
      { path: "ghost.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError when path escapes root", async () => {
    const result = await deleteFileTool.handler(
      { path: "../.." },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// move_file
// ---------------------------------------------------------------------------

describe("moveFileTool.handler", () => {
  it("renames a file within the root", async () => {
    writeFileSync(join(TMP, "original.txt"), "content");
    const result = await moveFileTool.handler(
      { source: "original.txt", destination: "renamed.txt" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "original.txt"))).toBe(false);
    expect(existsSync(join(TMP, "renamed.txt"))).toBe(true);
    expect(readFileSync(join(TMP, "renamed.txt"), "utf-8")).toBe("content");
  });

  it("moves a file into a subdirectory, creating parents", async () => {
    writeFileSync(join(TMP, "move-me.txt"), "data");
    const result = await moveFileTool.handler(
      {
        source: "move-me.txt",
        destination: "subdir/inner/move-me.txt",
        createParents: true,
      },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "move-me.txt"))).toBe(false);
    expect(existsSync(join(TMP, "subdir", "inner", "move-me.txt"))).toBe(true);
  });

  it("moves a directory", async () => {
    mkdirSync(join(TMP, "src-dir"), { recursive: true });
    writeFileSync(join(TMP, "src-dir", "file.txt"), "hello");
    const result = await moveFileTool.handler(
      { source: "src-dir", destination: "dst-dir" },
      makeCtx()
    );
    expect(result.isError).toBeUndefined();
    expect(existsSync(join(TMP, "src-dir"))).toBe(false);
    expect(existsSync(join(TMP, "dst-dir", "file.txt"))).toBe(true);
  });

  it("returns isError when destination escapes root", async () => {
    writeFileSync(join(TMP, "safe.txt"), "data");
    const result = await moveFileTool.handler(
      { source: "safe.txt", destination: "../../outside.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
    // Source file should still exist
    expect(existsSync(join(TMP, "safe.txt"))).toBe(true);
  });

  it("returns isError when source escapes root", async () => {
    const result = await moveFileTool.handler(
      { source: "../../outside.txt", destination: "inside.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });

  it("returns isError when source does not exist", async () => {
    const result = await moveFileTool.handler(
      { source: "ghost.txt", destination: "anywhere.txt" },
      makeCtx()
    );
    expect(result.isError).toBe(true);
  });
});
