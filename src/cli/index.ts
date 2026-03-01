import { Command } from "commander";

/** Creates and configures the CodeSpec CLI. */
export function createCli(): Command {
  const program = new Command();

  program
    .name("codespec")
    .description(
      "A deterministic behavioral specification language and CLI tool",
    )
    .version("0.1.0");

  // Commands will be registered here in later tasks

  return program;
}
