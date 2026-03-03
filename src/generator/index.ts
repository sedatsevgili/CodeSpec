// ---------------------------------------------------------------------------
// CodeSpec Generator Orchestrator
//
// Dispatches code generation to the correct language-specific generator based
// on the target parameter.
// ---------------------------------------------------------------------------

import type { ModuleNode } from "../ast/nodes.js";
import { generateTypeScript } from "./typescript.js";
import { generateJavaScript } from "./javascript.js";
import { generatePhp } from "./php.js";

export { generateTypeScript } from "./typescript.js";
export { generateJavaScript } from "./javascript.js";
export { generatePhp } from "./php.js";

/** Supported generation target identifiers. */
export type GeneratorTarget =
  | "ts"
  | "typescript"
  | "js"
  | "javascript"
  | "php";

/**
 * Generate source code from a CodeSpec ModuleNode in the specified target language.
 *
 * Supported targets:
 *  - `"ts"` / `"typescript"` -- TypeScript
 *  - `"js"` / `"javascript"` -- JavaScript
 *  - `"php"` -- PHP 8+
 *
 * @throws {Error} If the target language is not supported.
 */
export function generate(mod: ModuleNode, target: string): string {
  switch (target) {
    case "ts":
    case "typescript":
      return generateTypeScript(mod);
    case "js":
    case "javascript":
      return generateJavaScript(mod);
    case "php":
      return generatePhp(mod);
    default:
      throw new Error(
        `Unsupported generator target: ${JSON.stringify(target)}. ` +
          `Supported targets: ts, typescript, js, javascript, php`,
      );
  }
}
