// ---------------------------------------------------------------------------
// JavaScript Analyzer
//
// Thin wrapper around the TypeScript analyzer. Since ts-morph supports
// JavaScript files via `allowJs`, we reuse the TS analysis logic with JS-
// specific configuration. Fully deterministic: same input code always
// produces the same AST output.
// ---------------------------------------------------------------------------

import type { ModuleNode } from "../ast/nodes.js";
import { analyzeTypeScript, analyzeTypeScriptSource } from "./typescript.js";

// ---- Public API -----------------------------------------------------------

/**
 * Analyze a JavaScript file on disk and produce a CodeSpec ModuleNode.
 *
 * Delegates to the TypeScript analyzer since ts-morph handles JS files
 * natively. The module name is derived from the file name (without
 * extension), converted to PascalCase.
 */
export function analyzeJavaScript(filePath: string): ModuleNode {
  return analyzeTypeScript(filePath);
}

/**
 * Analyze JavaScript source code provided as a string and produce a CodeSpec
 * ModuleNode.
 *
 * This is useful for testing without writing files to disk. The source is
 * analyzed using ts-morph which can parse JavaScript syntax.
 *
 * @param source   - The JavaScript source code to analyze.
 * @param fileName - An optional virtual file name (defaults to "module.js").
 */
export function analyzeJavaScriptSource(
  source: string,
  fileName?: string,
): ModuleNode {
  const name = fileName ?? "module.js";
  return analyzeTypeScriptSource(source, name);
}
