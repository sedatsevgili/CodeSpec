// ---------------------------------------------------------------------------
// Analyzer Orchestrator
//
// Dispatches source code analysis to the correct language-specific analyzer
// and wraps the result in a SpecFile. Supports TypeScript, JavaScript, and
// PHP.
// ---------------------------------------------------------------------------

import type { SpecFile } from "../ast/nodes.js";
import { specFile } from "../ast/builder.js";
import { analyzeTypeScript, analyzeTypeScriptSource } from "./typescript.js";
import { analyzeJavaScript, analyzeJavaScriptSource } from "./javascript.js";
import { analyzePhp, analyzePhpSource } from "./php.js";

/** Supported language identifiers for the analyzer. */
export type AnalyzerLanguage =
  | "ts"
  | "typescript"
  | "js"
  | "javascript"
  | "php";

/**
 * Analyze a source file on disk and produce a CodeSpec SpecFile.
 *
 * The language is auto-detected from the file extension if not provided.
 * Supports TypeScript (.ts), JavaScript (.js), and PHP (.php) files.
 *
 * @param filePath - Path to the source file to analyze.
 * @param lang     - Optional language override (e.g. "ts", "typescript", "php").
 * @returns A complete SpecFile containing one module derived from the source.
 * @throws {Error} If the language is unsupported.
 */
export function analyze(filePath: string, lang?: string): SpecFile {
  const resolvedLang = lang ?? detectLanguage(filePath);

  switch (resolvedLang) {
    case "ts":
    case "typescript": {
      const moduleNode = analyzeTypeScript(filePath);
      return specFile({ modules: [moduleNode] });
    }
    case "js":
    case "javascript": {
      const moduleNode = analyzeJavaScript(filePath);
      return specFile({ modules: [moduleNode] });
    }
    case "php": {
      const moduleNode = analyzePhp(filePath);
      return specFile({ modules: [moduleNode] });
    }
    default:
      throw new Error(
        `Unsupported language: "${resolvedLang}". ` +
          `Currently supported: typescript (ts), javascript (js), php.`,
      );
  }
}

/**
 * Analyze source code from a string and produce a CodeSpec SpecFile.
 *
 * This is useful for testing and programmatic use without writing to disk.
 * The language is detected from the file name extension, or defaults to
 * TypeScript.
 *
 * @param source   - The source code to analyze.
 * @param fileName - Optional virtual file name (defaults to "module.ts").
 * @returns A complete SpecFile containing one module derived from the source.
 */
export function analyzeSource(
  source: string,
  fileName?: string,
): SpecFile {
  const name = fileName ?? "module.ts";
  const lang = detectLanguage(name);

  switch (lang) {
    case "php": {
      const moduleNode = analyzePhpSource(source, name);
      return specFile({ modules: [moduleNode] });
    }
    case "js": {
      const moduleNode = analyzeJavaScriptSource(source, name);
      return specFile({ modules: [moduleNode] });
    }
    default: {
      const moduleNode = analyzeTypeScriptSource(source, name);
      return specFile({ modules: [moduleNode] });
    }
  }
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

// Re-export the language-specific analyzer functions for direct use
export { analyzeTypeScript, analyzeTypeScriptSource } from "./typescript.js";
export { analyzeJavaScript, analyzeJavaScriptSource } from "./javascript.js";
export { analyzePhp, analyzePhpSource } from "./php.js";
export { mergeModules } from "./merge.js";
