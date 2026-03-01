import { Command } from "commander";
import { resolve } from "node:path";
import * as logger from "../../utils/logger.js";

/** Creates the `generate` command (spec -> code). */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate source code from a .spec.md file")
    .argument("<spec-file>", "Path to the .spec.md file")
    .option("-t, --target <language>", "Target language (ts, js, php)", "ts")
    .option("-o, --out <dir>", "Output directory for generated code")
    .action(async (specFile: string, options: { target: string; out?: string }) => {
      const spec = resolve(specFile);
      logger.info(`Generating ${options.target} code from ${spec}...`);
      // TODO: Wire up generator when implemented
      logger.warn("Generator not yet implemented");
    });
}
