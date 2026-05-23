import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "fs";
import { join } from "path";
import { guardPath, guardFilePath, PathGuardError } from "../../src/security/path-guard.js";
import type { Config } from "../../src/config.js";

const TMP = join(process.cwd(), "tmp-test-root");
const OUTSIDE = join(process.cwd(), "tmp-outside");

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    root: TMP,
    allowWrite: false,
    maxFileSizeBytes: 1024,
    excludePatterns: [".git", "node_modules", ".env*", "*.pem"],
    followSymlinks: false,
    ...overrides,
  };
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });
  mkdirSync(join(TMP, "subdir"), { recursive: true });
  mkdirSync(join(TMP, ".git"), { recursive: true });
  mkdirSync(join(TMP, "node_modules"), { recursive: true });
  writeFileSync(join(TMP, "hello.txt"), "hello world");
  writeFileSync(join(TMP, "big.txt"), "x".repeat(2048));
  writeFileSync(join(TMP, ".env"), "SECRET=abc");
  writeFileSync(join(TMP, "cert.pem"), "CERT");
  writeFileSync(join(TMP, "subdir", "nested.txt"), "nested");
  writeFileSync(join(OUTSIDE, "outside.txt"), "outside");
  try {
    symlinkSync(OUTSIDE, join(TMP, "symlink-to-outside"));
  } catch {
    // symlinks may not be supported on all CI environments
  }
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
});

describe("guardPath", () => {
  it("allows a valid file path", () => {
    const result = guardPath("hello.txt", makeConfig());
    expect(result).toBe(join(TMP, "hello.txt"));
  });

  it("allows the root itself (empty string)", () => {
    const result = guardPath("", makeConfig());
    expect(result).toBe(TMP);
  });

  it("allows a nested path", () => {
    const result = guardPath("subdir/nested.txt", makeConfig());
    expect(result).toBe(join(TMP, "subdir", "nested.txt"));
  });

  it("blocks traversal with ../", () => {
    expect(() => guardPath("../outside/outside.txt", makeConfig())).toThrow(
      PathGuardError
    );
  });

  it("blocks traversal via encoded sequences", () => {
    expect(() => guardPath("subdir/../../outside", makeConfig())).toThrow(
      PathGuardError
    );
  });

  it("blocks .git directory", () => {
    expect(() => guardPath(".git/config", makeConfig())).toThrow(PathGuardError);
  });

  it("blocks node_modules directory", () => {
    expect(() => guardPath("node_modules/some-pkg", makeConfig())).toThrow(
      PathGuardError
    );
  });

  it("blocks .env files", () => {
    expect(() => guardPath(".env", makeConfig())).toThrow(PathGuardError);
  });

  it("blocks .pem files", () => {
    expect(() => guardPath("cert.pem", makeConfig())).toThrow(PathGuardError);
  });

  it("blocks symlinks when followSymlinks is false", () => {
    expect(() => guardPath("symlink-to-outside", makeConfig())).toThrow(
      PathGuardError
    );
  });
});

describe("guardFilePath", () => {
  it("allows a valid file within size limit", async () => {
    const result = await guardFilePath("hello.txt", makeConfig());
    expect(result).toBe(join(TMP, "hello.txt"));
  });

  it("rejects a file exceeding maxFileSizeBytes", async () => {
    await expect(guardFilePath("big.txt", makeConfig())).rejects.toThrow(
      PathGuardError
    );
  });

  it("rejects a directory path", async () => {
    await expect(guardFilePath("subdir", makeConfig())).rejects.toThrow(
      PathGuardError
    );
  });
});
