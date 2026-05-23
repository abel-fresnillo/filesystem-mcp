import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve, isAbsolute } from "path";

const TMP = join(process.cwd(), "tmp-test-config");

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function withArgv<T>(extra: string[], fn: () => T): T {
  const original = process.argv.slice();
  process.argv = [...process.argv, ...extra];
  try {
    return fn();
  } finally {
    process.argv = original;
  }
}

async function loadConfigWith(extra: string[]) {
  // Bust the module cache by appending a query param so each dynamic import
  // is treated as a fresh module (vitest re-executes the module).
  const { loadConfig } = await import("../src/config.js?bust=" + Date.now());
  return withArgv(extra, () => loadConfig());
}

describe("loadConfig", () => {
  it("loads a valid config with all fields explicitly set", async () => {
    const configPath = join(TMP, "full-config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        root: TMP,
        allowWrite: true,
        maxFileSizeBytes: 5000,
        excludePatterns: [".git"],
        followSymlinks: true,
      })
    );

    const config = await loadConfigWith(["--config", configPath]);

    expect(config.root).toBe(resolve(TMP));
    expect(config.allowWrite).toBe(true);
    expect(config.maxFileSizeBytes).toBe(5000);
    expect(config.excludePatterns).toEqual([".git"]);
    expect(config.followSymlinks).toBe(true);
  });

  it("applies all defaults when only root is provided", async () => {
    const configPath = join(TMP, "minimal-config.json");
    writeFileSync(configPath, JSON.stringify({ root: TMP }));

    const config = await loadConfigWith(["--config", configPath]);

    expect(config.allowWrite).toBe(false);
    expect(config.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    expect(config.followSymlinks).toBe(false);
    expect(config.excludePatterns).toEqual([
      ".git",
      "node_modules",
      ".env*",
      "*.pem",
      "*.key",
    ]);
  });

  it("resolves a relative root to an absolute path", async () => {
    const configPath = join(TMP, "relative-root-config.json");
    // Use "." as root — it will resolve to process.cwd()
    writeFileSync(configPath, JSON.stringify({ root: "." }));

    const config = await loadConfigWith(["--config", configPath]);

    expect(isAbsolute(config.root)).toBe(true);
    expect(config.root).toBe(resolve("."));
  });

  it("throws a descriptive error when root is missing (invalid config)", async () => {
    const configPath = join(TMP, "no-root-config.json");
    writeFileSync(configPath, JSON.stringify({ allowWrite: true }));

    await expect(loadConfigWith(["--config", configPath])).rejects.toThrow(
      /Invalid config/
    );
  });

  it("throws when the config file contains invalid JSON", async () => {
    const configPath = join(TMP, "bad-json-config.json");
    writeFileSync(configPath, "{ this is not valid json }");

    await expect(loadConfigWith(["--config", configPath])).rejects.toThrow(
      /Failed to read config/
    );
  });
});
