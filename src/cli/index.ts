import { Command } from "commander";
import { createAnalyzeCommand } from "./commands/analyze.js";
import { createGenerateCommand } from "./commands/generate.js";
import { createValidateCommand } from "./commands/validate.js";
import { createDiffCommand } from "./commands/diff.js";

/** Creates and configures the CodeSpec CLI. */
export function createCli(): Command {
  const program = new Command();

  program
    .name("codespec")
    .description(
      "A deterministic behavioral specification language and CLI tool",
    )
    .version("0.1.0");

  program.addCommand(createAnalyzeCommand());
  program.addCommand(createGenerateCommand());
  program.addCommand(createValidateCommand());
  program.addCommand(createDiffCommand());

  return program;
}
