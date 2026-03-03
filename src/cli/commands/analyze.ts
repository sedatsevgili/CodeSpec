import { Command } from "commander";
import { resolve, basename, dirname, join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import * as logger from "../../utils/logger.js";
import { analyze } from "../../analyzer/index.js";
import { serializeSpecFile } from "../../serializer/index.js";
import { wrapInMarkdown } from "../../serializer/markdown.js";

/** Creates the `analyze` command (code -> spec). */
export function createAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Analyze source code and generate a .spec.md file")
    .argument("<file-or-dir>", "Source file or directory to analyze")
    .option("-l, --lang <language>", "Source language (ts, js, php)")
    .option("-o, --out <dir>", "Output directory for .spec.md files")
    .action((fileOrDir: string, options: { lang?: string; out?: string }) => {
      const source = resolve(fileOrDir);
      logger.info(`Analyzing ${source}...`);

      try {
        const specFile = analyze(source, options.lang);
        const codespecText = serializeSpecFile(specFile);
        const title = basename(source).replace(/\.[^.]+$/, "");
        const markdown = wrapInMarkdown(codespecText, title);

        if (options.out) {
          const outDir = resolve(options.out);
          mkdirSync(outDir, { recursive: true });
          const outPath = join(outDir, `${title}.spec.md`);
          writeFileSync(outPath, markdown, "utf-8");
          logger.success(`Wrote ${outPath}`);
        } else {
          process.stdout.write(markdown);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(errMsg);
        process.exitCode = 1;
      }
    });
}
