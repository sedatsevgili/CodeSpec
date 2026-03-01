import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";

/** Reads a file as UTF-8 text. */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

/** Writes text content to a file. */
export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await writeFile(path, content, "utf-8");
}

/** Recursively discovers files matching the given extensions. */
export async function discoverFiles(
  dir: string,
  extensions: readonly string[],
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...(await discoverFiles(fullPath, extensions)));
    } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

/** Checks if a path is a file. */
export async function isFile(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}
