// ---------------------------------------------------------------------------
// Analyzer Orchestrator
//
// Dispatches source code analysis to the correct language-specific analyzer
// and wraps the result in a SpecFile. Currently supports TypeScript/JavaScript.
// ---------------------------------------------------------------------------

import type { SpecFile } from "../ast/nodes.js";
import { specFile } from "../ast/builder.js";
import { analyzeTypeScript, analyzeTypeScriptSource } from "./typescript.js";

/** Supported language identifiers for the analyzer. */
export type AnalyzerLanguage = "ts" | "typescript" | "js" | "javascript";

/**
 * Analyze a source file on disk and produce a CodeSpec SpecFile.
 *
 * The language is auto-detected from the file extension if not provided.
 * Currently supports TypeScript (.ts) and JavaScript (.js) files.
 *
 * @param filePath - Path to the source file to analyze.
 * @param lang     - Optional language override (e.g. "ts", "typescript").
 * @returns A complete SpecFile containing one module derived from the source.
 * @throws {Error} If the language is unsupported.
 */
export function analyze(filePath: string, lang?: string): SpecFile {
  const resolvedLang = lang ?? detectLanguage(filePath);

  switch (resolvedLang) {
    case "ts":
    case "typescript":
    case "js":
    case "javascript": {
      const moduleNode = analyzeTypeScript(filePath);
      return specFile({ modules: [moduleNode] });
    }
    default:
      throw new Error(
        `Unsupported language: "${resolvedLang}". ` +
          `Currently supported: typescript (ts), javascript (js).`,
      );
  }
}

/**
 * Analyze TypeScript/JavaScript source code from a string and produce a
 * CodeSpec SpecFile.
 *
 * This is useful for testing and programmatic use without writing to disk.
 *
 * @param source   - The source code to analyze.
 * @param fileName - Optional virtual file name (defaults to "module.ts").
 * @returns A complete SpecFile containing one module derived from the source.
 */
export function analyzeSource(
  source: string,
  fileName?: string,
): SpecFile {
  const moduleNode = analyzeTypeScriptSource(source, fileName);
  return specFile({ modules: [moduleNode] });
}

/**
 * Detect the analyzer language from a file path extension.
 *
 * @returns The language identifier, or the extension itself if unknown.
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "php":
      return "php";
    default:
      return ext;
  }
}

// Re-export the TypeScript analyzer functions for direct use
export { analyzeTypeScript, analyzeTypeScriptSource } from "./typescript.js";
