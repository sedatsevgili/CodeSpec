import { Command } from "commander";
import { resolve, basename, dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as logger from "../../utils/logger.js";
import { parse } from "../../parser/index.js";
import { extractCodeSpecBlocks } from "../../serializer/markdown.js";
import { generate } from "../../generator/index.js";

/** Creates the `generate` command (spec -> code). */
export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate source code from a .spec.md file")
    .argument("<spec-file>", "Path to the .spec.md file")
    .option("-t, --target <language>", "Target language (ts, js, php)", "ts")
    .option("-o, --out <dir>", "Output directory for generated code")
    .action((specFile: string, options: { target: string; out?: string }) => {
      const specPath = resolve(specFile);
      logger.info(`Generating ${options.target} code from ${specPath}...`);

      try {
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
            const fileName = (mod.name ?? "module").replace(/\s+/g, "-").toLowerCase();
            const outPath = join(outDir, `${fileName}.${ext}`);
            writeFileSync(outPath, code, "utf-8");
            logger.success(`Wrote ${outPath}`);
          } else {
            process.stdout.write(code);
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(errMsg);
        process.exitCode = 1;
      }
    });
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
