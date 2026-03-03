import { Command } from "commander";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as logger from "../../utils/logger.js";
import { parse } from "../../parser/index.js";
import { extractCodeSpecBlocks } from "../../serializer/markdown.js";
import { diffSpecFiles } from "../../validator/diff.js";
import type { SpecChange } from "../../validator/diff.js";

/** Creates the `diff` command (behavioral diff between spec versions). */
export function createDiffCommand(): Command {
  return new Command("diff")
    .description("Show behavioral diff between two spec versions")
    .argument("<old-spec>", "Path to the old .spec.md file")
    .argument("<new-spec>", "Path to the new .spec.md file")
    .action((_oldSpec: string, _newSpec: string) => {
      const oldPath = resolve(_oldSpec);
      const newPath = resolve(_newSpec);

      logger.info(`Diffing ${oldPath} vs ${newPath}...`);

      try {
        const oldAst = parseSpecFile(oldPath);
        const newAst = parseSpecFile(newPath);

        const result = diffSpecFiles(oldAst, newAst);

        if (result.identical) {
          logger.success("No behavioral changes detected.");
          return;
        }

        // Print each change
        for (const change of result.changes) {
          printChange(change);
        }

        // Print summary
        logger.info(result.summary);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(errMsg);
        process.exitCode = 1;
      }
    });
}

/**
 * Read and parse a .spec.md file into a SpecFile AST.
 *
 * Handles both raw CodeSpec text and markdown-wrapped spec files.
 */
function parseSpecFile(filePath: string): ReturnType<typeof parse> {
  const text = readFileSync(filePath, "utf-8");

  // Try extracting from markdown first
  const blocks = extractCodeSpecBlocks(text);
  if (blocks.length > 0) {
    return parse(blocks.join("\n"));
  }

  // Fall back to treating the entire file as raw CodeSpec text
  return parse(text);
}

/** Print a single change with a symbol prefix indicating the kind. */
function printChange(change: SpecChange): void {
  const symbol = changeSymbol(change.kind);
  const message = `${symbol} [${change.path}] ${change.message}`;

  switch (change.kind) {
    case "added":
      logger.info(message);
      break;
    case "removed":
      logger.warn(message);
      break;
    case "modified":
      logger.warn(message);
      break;
  }
}

/** Get a symbol for a change kind. */
function changeSymbol(kind: SpecChange["kind"]): string {
  switch (kind) {
    case "added":
      return "+";
    case "removed":
      return "-";
    case "modified":
      return "~";
  }
}
