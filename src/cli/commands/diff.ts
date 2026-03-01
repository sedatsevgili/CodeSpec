import { Command } from "commander";
import { resolve } from "node:path";
import * as logger from "../../utils/logger.js";

/** Creates the `diff` command (behavioral diff between spec versions). */
export function createDiffCommand(): Command {
  return new Command("diff")
    .description("Show behavioral diff between two spec versions")
    .argument("<old-spec>", "Path to the old .spec.md file")
    .argument("<new-spec>", "Path to the new .spec.md file")
    .action(async (oldSpec: string, newSpec: string) => {
      const oldPath = resolve(oldSpec);
      const newPath = resolve(newSpec);
      logger.info(`Diffing ${oldPath} vs ${newPath}...`);
      // TODO: Wire up diff engine when implemented
      logger.warn("Diff not yet implemented");
    });
}
