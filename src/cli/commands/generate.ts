import { Command } from "commander";
import { resolve, basename, dirname, join, relative } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import * as logger from "../../utils/logger.js";
import { parse } from "../../parser/index.js";
import { extractCodeSpecBlocks } from "../../serializer/markdown.js";
import { generate } from "../../generator/index.js";
import { discoverFiles } from "../../utils/files.js";

/** Creates the `generate` command (spec -> code). */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate source code from a .spec.md file")
    .argument("<spec-file>", "Path to the .spec.md file or directory")
    .option("-t, --target <language>", "Target language (ts, js, php)", "ts")
    .option("-o, --out <dir>", "Output directory for generated code")
    .action(
      async (specFile: string, options: { target: string; out?: string }) => {
        const specPath = resolve(specFile);

        try {
          const stats = statSync(specPath);

          if (stats.isDirectory()) {
            await generateFromDirectory(specPath, options);
          } else {
            generateFromSingleFile(specPath, options);
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(errMsg);
          process.exitCode = 1;
        }
      },
    );
}

/** Generate code from a single spec file. */
function generateFromSingleFile(
  specPath: string,
  options: { target: string; out?: string },
): void {
  logger.info(`Generating ${options.target} code from ${specPath}...`);

  const text = readFileSync(specPath, "utf-8");
  const blocks = extractCodeSpecBlocks(text);
  const codespecText = blocks.length > 0 ? blocks.join("\n") : text;
  const specAst = parse(codespecText);

  const ext = targetExtension(options.target);
  for (const mod of specAst.modules) {
    const code = generate(mod, options.target);

    if (options.out) {
      const outDir = resolve(options.out);
      mkdirSync(outDir, { recursive: true });
      const fileName = (mod.name ?? "module")
        .replace(/\s+/g, "-")
        .toLowerCase();
      const outPath = join(outDir, `${fileName}.${ext}`);
      writeFileSync(outPath, code, "utf-8");
      logger.success(`Wrote ${outPath}`);
    } else {
      process.stdout.write(code);
    }
  }
}

/** Generate code from all .spec.md files in a directory. */
async function generateFromDirectory(
  dir: string,
  options: { target: string; out?: string },
): Promise<void> {
  const mdFiles = await discoverFiles(dir, [".md"]);
  const files = mdFiles.filter((f) => f.endsWith(".spec.md"));

  if (files.length === 0) {
    logger.warn(`No .spec.md files found in ${dir}`);
    return;
  }

  logger.info(`Found ${files.length} spec file(s) in ${dir}`);

  const ext = targetExtension(options.target);
  let succeeded = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const text = readFileSync(file, "utf-8");
      const blocks = extractCodeSpecBlocks(text);
      const codespecText = blocks.length > 0 ? blocks.join("\n") : text;
      const specAst = parse(codespecText);

      for (const mod of specAst.modules) {
        const code = generate(mod, options.target);

        if (options.out) {
          const relPath = relative(dir, file);
          const relDir = dirname(relPath);
          const outDir = resolve(options.out, relDir);
          mkdirSync(outDir, { recursive: true });
          const fileName = (mod.name ?? "module")
            .replace(/\s+/g, "-")
            .toLowerCase();
          const outPath = join(outDir, `${fileName}.${ext}`);
          writeFileSync(outPath, code, "utf-8");
          logger.success(`Wrote ${outPath}`);
        } else {
          process.stdout.write(code);
        }
      }
      succeeded++;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to generate from ${file}: ${errMsg}`);
      failed++;
    }
  }

  logger.info(
    `Done: ${succeeded} succeeded, ${failed} failed out of ${files.length} file(s)`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

/** Map target language to file extension. */
function targetExtension(target: string): string {
  switch (target) {
    case "ts":
    case "typescript":
      return "ts";
    case "js":
    case "javascript":
      return "js";
    case "php":
      return "php";
    default:
      return "txt";
  }
}
