// ---------------------------------------------------------------------------
// CodeSpec Validator
//
// Reads a .spec.md file and optionally a source file, then compares the two
// to detect structural drift. When no source file is provided the validator
// only checks that the spec parses correctly.
//
// All analysis is deterministic — no AI, no network, no randomness.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { parse } from "../parser/index.js";
import { analyze } from "../analyzer/index.js";
import { extractCodeSpecBlocks } from "../serializer/markdown.js";
import type { ModuleNode } from "../ast/nodes.js";
import { detectDrift } from "./drift.js";
import type { DriftIssue } from "./drift.js";

// ---- Public types ---------------------------------------------------------

/** Severity of a validation issue. */
export type ValidationSeverity = "error" | "warning" | "info";

/** A single validation issue found during the consistency check. */
export interface ValidationIssue {
  /** Severity of the issue. */
  readonly severity: ValidationSeverity;
  /** A human-readable description of the issue. */
  readonly message: string;
  /**
   * Dot-separated path describing where the issue was found.
   * Examples: "ACTION.register", "INPUT.email"
   */
  readonly path?: string;
}

/** The result of running the validator. */
export interface ValidationResult {
  /** True if no errors were found (warnings are acceptable). */
  readonly valid: boolean;
  /** All issues found during validation. */
  readonly issues: readonly ValidationIssue[];
  /** The spec module node (if parsing succeeded). */
  readonly specModule?: ModuleNode;
  /** The source module node (if source analysis succeeded). */
  readonly sourceModule?: ModuleNode;
}

// ---- Public API -----------------------------------------------------------

/**
 * Validate a .spec.md file, optionally comparing it against source code.
 *
 * When `sourceFile` is provided, the validator analyzes the source code and
 * performs a structural comparison, reporting any drift. When `sourceFile` is
 * omitted, only the spec's parsability is checked.
 *
 * @param specFile   - Path to the .spec.md file.
 * @param sourceFile - Optional path to the source file to validate against.
 * @returns A ValidationResult with all found issues.
 */
export function validate(
  specFile: string,
  sourceFile?: string,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Step 1: Read and parse the spec file
  let specModule: ModuleNode | undefined;
  try {
    const specText = readFileSync(specFile, "utf-8");
    const blocks = extractCodeSpecBlocks(specText);

    if (blocks.length === 0) {
      issues.push({
        severity: "error",
        message: `No CodeSpec blocks found in "${specFile}". Expected at least one fenced \`\`\`codespec block.`,
      });
      return { valid: false, issues };
    }

    // Parse all blocks and collect modules
    const allCodespec = blocks.join("\n");
    const specAst = parse(allCodespec);

    if (specAst.modules.length === 0) {
      issues.push({
        severity: "error",
        message: `No MODULE declarations found in "${specFile}".`,
      });
      return { valid: false, issues };
    }

    if (specAst.modules.length > 1) {
      issues.push({
        severity: "warning",
        message: `Multiple MODULE declarations found in "${specFile}". Only the first module will be validated.`,
      });
    }

    specModule = specAst.modules[0];
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    issues.push({
      severity: "error",
      message: `Failed to parse spec file "${specFile}": ${errMsg}`,
    });
    return { valid: false, issues };
  }

  // Step 2: If no source file, we're done (spec parses cleanly)
  if (!sourceFile) {
    issues.push({
      severity: "info",
      message: "Spec file parsed successfully. No source file provided for comparison.",
    });
    return { valid: true, issues, specModule };
  }

  // Step 3: Analyze the source file
  let sourceModule: ModuleNode | undefined;
  try {
    const sourceAst = analyze(sourceFile);

    if (sourceAst.modules.length === 0) {
      issues.push({
        severity: "error",
        message: `No modules could be extracted from source file "${sourceFile}".`,
      });
      return { valid: false, issues, specModule };
    }

    sourceModule = sourceAst.modules[0];
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    issues.push({
      severity: "error",
      message: `Failed to analyze source file "${sourceFile}": ${errMsg}`,
    });
    return { valid: false, issues, specModule };
  }

  // Step 4: Detect drift between spec and source
  const driftIssues = detectDrift(specModule, sourceModule);

  for (const drift of driftIssues) {
    issues.push({
      severity: driftSeverity(drift),
      message: drift.message,
      path: drift.path,
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { valid: !hasErrors, issues, specModule, sourceModule };
}

/**
 * Validate spec text directly against a source ModuleNode (for testing).
 *
 * This is a convenience function that avoids file I/O. The spec text should
 * be raw CodeSpec language (not wrapped in markdown).
 *
 * @param specText     - Raw CodeSpec language text.
 * @param sourceModule - The module AST from source code analysis.
 * @returns A ValidationResult with all found issues.
 */
export function validateFromAst(
  specText: string,
  sourceModule: ModuleNode,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  let specModule: ModuleNode;
  try {
    const specAst = parse(specText);
    if (specAst.modules.length === 0) {
      issues.push({
        severity: "error",
        message: "No MODULE declarations found in spec text.",
      });
      return { valid: false, issues };
    }
    specModule = specAst.modules[0];
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    issues.push({
      severity: "error",
      message: `Failed to parse spec text: ${errMsg}`,
    });
    return { valid: false, issues };
  }

  const driftIssues = detectDrift(specModule, sourceModule);

  for (const drift of driftIssues) {
    issues.push({
      severity: driftSeverity(drift),
      message: drift.message,
      path: drift.path,
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { valid: !hasErrors, issues, specModule, sourceModule };
}

// ---- Helpers --------------------------------------------------------------

/**
 * Map a DriftIssue to a validation severity.
 *
 * - "removed" and "added" actions/fields are errors (structural mismatch).
 * - "changed" signatures are errors.
 * - Invariant differences are warnings (invariants are natural language and
 *   cannot be auto-generated from code).
 */
function driftSeverity(drift: DriftIssue): ValidationSeverity {
  if (drift.path.startsWith("INVARIANTS")) {
    return "warning";
  }
  return "error";
}

// Re-export drift detection types for consumers
export type { DriftIssue, DriftKind } from "./drift.js";
export { detectDrift } from "./drift.js";
