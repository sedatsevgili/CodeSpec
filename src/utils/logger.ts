import chalk from "chalk";

/** Log levels for the CodeSpec logger. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

/** Sets the minimum log level. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Logs a debug message. */
export function debug(message: string): void {
  if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.debug) {
    console.log(chalk.gray(`[debug] ${message}`));
  }
}

/** Logs an info message. */
export function info(message: string): void {
  if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.info) {
    console.log(chalk.blue(`[info] ${message}`));
  }
}

/** Logs a warning message. */
export function warn(message: string): void {
  if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.warn) {
    console.log(chalk.yellow(`[warn] ${message}`));
  }
}

/** Logs an error message. */
export function error(message: string): void {
  if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.error) {
    console.log(chalk.red(`[error] ${message}`));
  }
}

/** Logs a success message (always shown). */
export function success(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}
