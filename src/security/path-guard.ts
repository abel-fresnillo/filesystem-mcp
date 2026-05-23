import { statSync, lstatSync, realpathSync } from "fs";
import { stat } from "fs/promises";
import { join, resolve } from "path";
import micromatch from "micromatch";
import type { Config } from "../config.js";

export class PathGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathGuardError";
  }
}

/**
 * Resolves and validates a user-supplied path against the configured root.
 * Returns the absolute safe path or throws PathGuardError.
 *
 * All filesystem tools MUST call this before any I/O — never resolve paths independently.
 */
export function guardPath(userPath: string, config: Config): string {
  const joined = join(config.root, userPath);
  const resolved = safeRealpath(joined, config);

  if (!resolved.startsWith(config.root + "/") && resolved !== config.root) {
    throw new PathGuardError(
      `Access denied: path escapes the allowed root directory`
    );
  }

  const relative = resolved.slice(config.root.length + 1) || ".";
  if (isExcluded(relative, config.excludePatterns)) {
    throw new PathGuardError(`Access denied: path matches an excluded pattern`);
  }

  return resolved;
}

/**
 * Like guardPath but also enforces the file size limit.
 * Use this before reading file contents.
 */
export async function guardFilePath(
  userPath: string,
  config: Config
): Promise<string> {
  const safePath = guardPath(userPath, config);

  const info = await stat(safePath);
  if (!info.isFile()) {
    throw new PathGuardError(`Not a file: ${userPath}`);
  }
  if (info.size > config.maxFileSizeBytes) {
    const mb = (config.maxFileSizeBytes / 1024 / 1024).toFixed(1);
    throw new PathGuardError(
      `File too large (limit: ${mb} MB): ${userPath}`
    );
  }

  return safePath;
}

function safeRealpath(absolutePath: string, config: Config): string {
  if (config.followSymlinks) {
    try {
      return realpathSync(absolutePath);
    } catch {
      // Path doesn't exist yet (write operations) — resolve without realpath
      return resolve(absolutePath);
    }
  }

  // Walk the path segment by segment, resolving each without following symlinks
  const segments = absolutePath.split("/").filter(Boolean);
  let current = "/";

  for (const segment of segments) {
    const next = join(current, segment);
    try {
      const info = lstatSync(next);
      if (info.isSymbolicLink()) {
        throw new PathGuardError(
          `Access denied: symbolic links are not permitted`
        );
      }
    } catch (err) {
      if (err instanceof PathGuardError) throw err;
      // Path doesn't exist yet — stop resolving and return as-is
      return resolve(absolutePath);
    }
    current = next;
  }

  return resolve(absolutePath);
}

function isExcluded(relative: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const parts = relative.split("/");
  // Check each path segment against patterns (catches excluded dirs anywhere in the tree)
  return parts.some((segment) => micromatch.isMatch(segment, patterns)) ||
    micromatch.isMatch(relative, patterns);
}
