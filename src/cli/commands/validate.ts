import { Command } from "commander";
import { resolve } from "node:path";
import * as logger from "../../utils/logger.js";
import { validate } from "../../validator/index.js";
import type { ValidationIssue } from "../../validator/index.js";

/** Creates the `validate` command (spec <-> code consistency check). */
export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate that a .spec.md matches its source code")
    .argument("<spec-file>", "Path to the .spec.md file")
    .option("-s, --source <file>", "Source file to validate against")
    .action((_specFile: string, options: { source?: string }) => {
      const specPath = resolve(_specFile);
      const sourcePath = options.source ? resolve(options.source) : undefined;

      logger.info(`Validating ${specPath}...`);
      if (sourcePath) {
        logger.info(`Against source: ${sourcePath}`);
      }

      const result = validate(specPath, sourcePath);

      // Print issues
      for (const issue of result.issues) {
        printIssue(issue);
      }

      // Print summary
      const errorCount = result.issues.filter(
        (i) => i.severity === "error",
      ).length;
      const warnCount = result.issues.filter(
        (i) => i.severity === "warning",
      ).length;

      if (result.valid) {
        logger.success(
          `Validation passed${warnCount > 0 ? ` with ${String(warnCount)} warning${warnCount === 1 ? "" : "s"}` : ""}`,
        );
      } else {
        logger.error(
          `Validation failed: ${String(errorCount)} error${errorCount === 1 ? "" : "s"}${warnCount > 0 ? `, ${String(warnCount)} warning${warnCount === 1 ? "" : "s"}` : ""}`,
        );
        process.exitCode = 1;
      }
    });
}

/** Print a single validation issue with appropriate formatting. */
function printIssue(issue: ValidationIssue): void {
  const prefix = issue.path ? `[${issue.path}] ` : "";
  const message = `${prefix}${issue.message}`;

  switch (issue.severity) {
    case "error":
      logger.error(message);
      break;
    case "warning":
      logger.warn(message);
      break;
    case "info":
      logger.info(message);
      break;
  }
}
