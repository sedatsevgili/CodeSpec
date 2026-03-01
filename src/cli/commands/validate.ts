import { Command } from "commander";
import { resolve } from "node:path";
import * as logger from "../../utils/logger.js";

/** Creates the `validate` command (spec <-> code consistency check). */
export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate that a .spec.md matches its source code")
    .argument("<spec-file>", "Path to the .spec.md file")
    .option("-s, --source <file>", "Source file to validate against")
    .action(async (specFile: string, options: { source?: string }) => {
      const spec = resolve(specFile);
      logger.info(`Validating ${spec}...`);
      if (options.source) {
        logger.info(`Against source: ${resolve(options.source)}`);
      }
      // TODO: Wire up validator when implemented
      logger.warn("Validator not yet implemented");
    });
}
