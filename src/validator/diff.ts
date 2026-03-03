// ---------------------------------------------------------------------------
// CodeSpec Behavioral Diff Engine
//
// Compares two CodeSpec spec texts structurally and reports behavioral
// changes between them. This is used by the `codespec diff` CLI command
// to show what changed between two versions of a specification.
//
// The diff is structural (AST-based), not text-based. It re-uses the drift
// detection engine internally but frames the output as "old vs new" rather
// than "spec vs source".
// ---------------------------------------------------------------------------

import type { ModuleNode, SpecFile } from "../ast/nodes.js";
import { detectDrift } from "./drift.js";
import type { DriftIssue, DriftKind } from "./drift.js";

// ---- Public types ---------------------------------------------------------

/** The kind of change detected between two spec versions. */
export type ChangeKind = "added" | "removed" | "modified";

/** A single behavioral change between two spec versions. */
export interface SpecChange {
  /** Whether the element was added, removed, or modified. */
  readonly kind: ChangeKind;
  /** Dot-separated path to the changed element. */
  readonly path: string;
  /** A human-readable description of the change. */
  readonly message: string;
}

/** The result of diffing two spec versions. */
export interface DiffResult {
  /** True if the two specs are structurally identical. */
  readonly identical: boolean;
  /** A summary line (e.g. "3 changes: 1 added, 1 removed, 1 modified"). */
  readonly summary: string;
  /** All individual changes found. */
  readonly changes: readonly SpecChange[];
}

// ---- Public API -----------------------------------------------------------

/**
 * Diff two parsed SpecFile ASTs and report behavioral changes.
 *
 * The comparison is done module-by-module. If the spec files have different
 * numbers of modules or different module names, those are reported as
 * top-level changes.
 *
 * @param oldSpec - The older version of the spec (the baseline).
 * @param newSpec - The newer version of the spec.
 * @returns A DiffResult describing all behavioral changes.
 */
export function diffSpecFiles(
  oldSpec: SpecFile,
  newSpec: SpecFile,
): DiffResult {
  const changes: SpecChange[] = [];

  const oldModules = new Map(oldSpec.modules.map((m) => [m.name, m]));
  const newModules = new Map(newSpec.modules.map((m) => [m.name, m]));

  // Modules present in old but not in new
  for (const [name] of oldModules) {
    if (!newModules.has(name)) {
      changes.push({
        kind: "removed",
        path: `MODULE.${name}`,
        message: `Module "${name}" was removed`,
      });
    }
  }

  // Modules present in new but not in old
  for (const [name] of newModules) {
    if (!oldModules.has(name)) {
      changes.push({
        kind: "added",
        path: `MODULE.${name}`,
        message: `Module "${name}" was added`,
      });
    }
  }

  // Modules present in both — compare structurally
  for (const [name, oldModule] of oldModules) {
    const newModule = newModules.get(name);
    if (!newModule) continue;

    const moduleChanges = diffModules(oldModule, newModule);
    changes.push(...moduleChanges);
  }

  const summary = buildSummary(changes);
  return {
    identical: changes.length === 0,
    summary,
    changes,
  };
}

/**
 * Diff two ModuleNode ASTs and report behavioral changes.
 *
 * This re-uses the drift detection engine, interpreting "old" as "spec" and
 * "new" as "source" — i.e. the drift engine finds what changed from old to
 * new.
 *
 * @param oldModule - The older version of the module.
 * @param newModule - The newer version of the module.
 * @returns An array of SpecChange objects.
 */
export function diffModules(
  oldModule: ModuleNode,
  newModule: ModuleNode,
): SpecChange[] {
  const driftIssues = detectDrift(oldModule, newModule);
  return driftIssues.map(driftToChange);
}

// ---- Helpers --------------------------------------------------------------

/** Convert a DriftKind to a ChangeKind (maps "changed" to "modified"). */
function mapKind(driftKind: DriftKind): ChangeKind {
  if (driftKind === "changed") return "modified";
  return driftKind;
}

/** Convert a DriftIssue to a SpecChange. */
function driftToChange(drift: DriftIssue): SpecChange {
  return {
    kind: mapKind(drift.kind),
    path: drift.path,
    message: drift.message,
  };
}

/** Build a human-readable summary of the changes. */
function buildSummary(changes: readonly SpecChange[]): string {
  if (changes.length === 0) {
    return "No behavioral changes detected.";
  }

  const added = changes.filter((c) => c.kind === "added").length;
  const removed = changes.filter((c) => c.kind === "removed").length;
  const modified = changes.filter((c) => c.kind === "modified").length;

  const parts: string[] = [];
  if (added > 0) parts.push(`${String(added)} added`);
  if (removed > 0) parts.push(`${String(removed)} removed`);
  if (modified > 0) parts.push(`${String(modified)} modified`);

  return `${String(changes.length)} change${changes.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}
