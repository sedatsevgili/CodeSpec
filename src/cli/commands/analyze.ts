import { Command } from "commander";
import { resolve } from "node:path";
import * as logger from "../../utils/logger.js";

/** Creates the `analyze` command (code -> spec). */
export function createAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Analyze source code and generate a .spec.md file")
    .argument("<file-or-dir>", "Source file or directory to analyze")
    .option("-l, --lang <language>", "Source language (ts, js, php)", "ts")
    .option("-o, --out <dir>", "Output directory for .spec.md files")
    .action(async (fileOrDir: string, options: { lang: string; out?: string }) => {
      const source = resolve(fileOrDir);
      logger.info(`Analyzing ${source} (${options.lang})...`);
      // TODO: Wire up analyzer when implemented
      logger.warn("Analyzer not yet implemented");
    });
}
