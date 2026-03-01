// ---------------------------------------------------------------------------
// CodeSpec Parser Wrapper
//
// Compiles the Peggy grammar at module load time and exposes a typed
// `parse` / `parseModule` API that returns AST nodes matching the
// interfaces defined in src/ast/nodes.ts.
//
// The grammar file is located relative to this module and read with
// readFileSync — no network, no AI, fully deterministic.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import peggy from "peggy";
import type { SpecFile, ModuleNode } from "../ast/nodes.js";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** A human-friendly parse error with source location information. */
export class ParseError extends Error {
  /** 1-based line number where the error occurred. */
  readonly line: number;
  /** 1-based column number where the error occurred. */
  readonly column: number;
  /** Tokens the parser expected at the error location. */
  readonly expected: readonly string[];
  /** The text the parser found instead. */
  readonly found: string | null;

  constructor(
    message: string,
    line: number,
    column: number,
    expected: readonly string[],
    found: string | null,
  ) {
    super(message);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
    this.expected = expected;
    this.found = found;
  }
}

// ---------------------------------------------------------------------------
// Grammar loading & parser compilation (runs once at module load)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const grammarPath = resolve(__dirname, "grammar.peggy");
const grammarSource = readFileSync(grammarPath, "utf-8");

/**
 * The compiled Peggy parser instance. Created once at module load time so
 * every subsequent call to `parse()` is as fast as possible.
 */
const compiledParser = peggy.generate(grammarSource);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

interface PeggySyntaxError {
  message: string;
  location?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  expected?: ReadonlyArray<{ type: string; description?: string; text?: string }>;
  found?: string | null;
}

/**
 * Returns true if the given value looks like a Peggy SyntaxError with
 * location information.
 */
function isPeggySyntaxError(err: unknown): err is PeggySyntaxError {
  return (
    err instanceof Error &&
    "location" in err &&
    typeof (err as PeggySyntaxError).location === "object" &&
    (err as PeggySyntaxError).location !== null
  );
}

/**
 * Formats a Peggy `expected` entry into a short human-readable label.
 */
function formatExpectedEntry(entry: { type: string; description?: string; text?: string }): string {
  if (entry.description) {
    return entry.description;
  }
  if (entry.text) {
    return JSON.stringify(entry.text);
  }
  return entry.type;
}

/**
 * De-duplicates and joins expected tokens into a readable list.
 */
function formatExpected(
  expected: ReadonlyArray<{ type: string; description?: string; text?: string }>,
): string {
  const labels = [...new Set(expected.map(formatExpectedEntry))];
  if (labels.length === 0) return "end of input";
  if (labels.length === 1) return labels[0];
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `${rest.join(", ")}, or ${last}`;
}

/**
 * Builds a friendly multi-line error message from a Peggy SyntaxError.
 */
function formatParseError(err: PeggySyntaxError): string {
  const loc = err.location;
  const line = loc?.start.line ?? 0;
  const column = loc?.start.column ?? 0;

  const found =
    err.found === null || err.found === undefined
      ? "end of input"
      : JSON.stringify(err.found);

  const expectedStr = err.expected ? formatExpected(err.expected) : "unknown";

  return (
    `Parse error at line ${line}, column ${column}: ` +
    `Unexpected ${found}. ` +
    `Expected ${expectedStr}.`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a CodeSpec specification string into a `SpecFile` AST node.
 *
 * The input may contain one or more MODULE declarations and top-level
 * comments. The returned `SpecFile` is fully typed and immutable.
 *
 * @param input - The CodeSpec source text to parse.
 * @returns The parsed `SpecFile` AST node.
 * @throws {ParseError} When the input contains a syntax error.
 */
export function parse(input: string): SpecFile {
  try {
    return compiledParser.parse(input) as SpecFile;
  } catch (err: unknown) {
    if (isPeggySyntaxError(err)) {
      const loc = err.location;
      const line = loc?.start.line ?? 0;
      const column = loc?.start.column ?? 0;
      const expected = err.expected
        ? err.expected.map(formatExpectedEntry)
        : [];
      const found = err.found ?? null;
      throw new ParseError(
        formatParseError(err),
        line,
        column,
        expected,
        found,
      );
    }
    throw err;
  }
}

/**
 * Convenience function that parses a CodeSpec string containing exactly one
 * MODULE and returns the `ModuleNode` directly.
 *
 * @param input - The CodeSpec source text containing a single MODULE.
 * @returns The parsed `ModuleNode`.
 * @throws {ParseError} When the input contains a syntax error.
 * @throws {Error} When the input does not contain exactly one MODULE.
 */
export function parseModule(input: string): ModuleNode {
  const specFile = parse(input);
  if (specFile.modules.length === 0) {
    throw new Error("Expected at least one MODULE declaration, but none were found.");
  }
  if (specFile.modules.length > 1) {
    throw new Error(
      `Expected exactly one MODULE declaration, but found ${specFile.modules.length}. ` +
        `Use parse() instead to handle multiple modules.`,
    );
  }
  return specFile.modules[0];
}
