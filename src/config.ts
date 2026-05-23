import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

const ConfigSchema = z.object({
  root: z.string().min(1),
  allowWrite: z.boolean().default(false),
  maxFileSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
  excludePatterns: z
    .array(z.string())
    .default([".git", "node_modules", ".env*", "*.pem", "*.key"]),
  followSymlinks: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const configPath = resolveConfigPath();

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config at ${configPath}: ${message}`);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config at ${configPath}:\n${issues}`);
  }

  const config = result.data;
  config.root = resolve(config.root);
  return config;
}

function resolveConfigPath(): string {
  const flag = process.argv.indexOf("--config");
  if (flag !== -1 && process.argv[flag + 1]) {
    return resolve(process.argv[flag + 1]);
  }
  return resolve("filesystem-mcp.json");
}
