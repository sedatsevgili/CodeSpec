import { Command } from "commander";
import { resolve, basename, dirname, join, relative } from "node:path";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import * as logger from "../../utils/logger.js";
import { analyze } from "../../analyzer/index.js";
import { serializeSpecFile } from "../../serializer/index.js";
import { wrapInMarkdown } from "../../serializer/markdown.js";
import { discoverFiles } from "../../utils/files.js";

/** Source code file extensions supported by the analyzer. */
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".php"];

/** Patterns that indicate test files to skip during directory analysis. */
function isTestFile(filePath: string): boolean {
  const name = basename(filePath);
  return /\.(test|spec)\./i.test(name);
}

/** Creates the `analyze` command (code -> spec). */
export function createAnalyzeCommand(): Command {
  return new Command("analyze")
    .description("Analyze source code and generate a .spec.md file")
    .argument("<file-or-dir>", "Source file or directory to analyze")
    .option("-l, --lang <language>", "Source language (ts, js, php)")
    .option("-o, --out <dir>", "Output directory for .spec.md files")
    .action(
      async (fileOrDir: string, options: { lang?: string; out?: string }) => {
        const source = resolve(fileOrDir);

        try {
          const stats = statSync(source);

          if (stats.isDirectory()) {
            await analyzeDirectory(source, options);
          } else {
            analyzeSingleFile(source, options);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(errMsg);
          process.exitCode = 1;
        }
      },
    );
}

/** Analyze a single source file. */
function analyzeSingleFile(
  source: string,
  options: { lang?: string; out?: string },
): void {
  logger.info(`Analyzing ${source}...`);

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
}

/** Analyze all source files in a directory. */
async function analyzeDirectory(
  dir: string,
  options: { lang?: string; out?: string },
): Promise<void> {
  const files = await discoverFiles(dir, CODE_EXTENSIONS);
  const sourceFiles = files.filter((f) => !isTestFile(f));

  if (sourceFiles.length === 0) {
    logger.warn(`No source files found in ${dir}`);
    return;
  }

  logger.info(`Found ${sourceFiles.length} source file(s) in ${dir}`);

  let succeeded = 0;
  let failed = 0;

  for (const file of sourceFiles) {
    try {
      const specFile = analyze(file, options.lang);
      const codespecText = serializeSpecFile(specFile);
      const title = basename(file).replace(/\.[^.]+$/, "");
      const markdown = wrapInMarkdown(codespecText, title);

      if (options.out) {
        const relPath = relative(dir, file);
        const relDir = dirname(relPath);
        const outDir = resolve(options.out, relDir);
        mkdirSync(outDir, { recursive: true });
        const outPath = join(outDir, `${title}.spec.md`);
        writeFileSync(outPath, markdown, "utf-8");
        logger.success(`Wrote ${outPath}`);
      } else {
        process.stdout.write(markdown);
      }
      succeeded++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to analyze ${file}: ${errMsg}`);
      failed++;
    }
  }

  logger.info(
    `Done: ${succeeded} succeeded, ${failed} failed out of ${sourceFiles.length} file(s)`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}
