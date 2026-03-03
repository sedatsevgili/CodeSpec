// ---------------------------------------------------------------------------
// CodeSpec Drift Detection Engine
//
// Compares two ModuleNode ASTs structurally and reports every difference as a
// DriftIssue. The comparison is purely structural (AST-based) — no string
// diffing, no heuristics.
//
// Usage:
//   const issues = detectDrift(specModule, sourceModule);
// ---------------------------------------------------------------------------

import type {
  ModuleNode,
  ActionNode,
  ParameterNode,
  FieldNode,
  StateFieldNode,
  TypeReference,
  Constraints,
  InvariantRule,
  ErrorDef,
  DependencyDef,
} from "../ast/nodes.js";

// ---- Public types ---------------------------------------------------------

/** The kind of drift detected between two AST structures. */
export type DriftKind = "added" | "removed" | "changed";

/** A single structural difference between a spec and its source. */
export interface DriftIssue {
  /** Whether the element was added, removed, or changed. */
  readonly kind: DriftKind;
  /**
   * A dot-separated path describing where the drift was found.
   * Examples: "ACTION.register", "INPUT.email", "DEPENDS.Database"
   */
  readonly path: string;
  /** A human-readable description of the drift. */
  readonly message: string;
}

// ---- Public API -----------------------------------------------------------

/**
 * Compare two ModuleNode ASTs and return all structural differences.
 *
 * The `specModule` is the "expected" state (from the .spec.md file) and
 * `sourceModule` is the "actual" state (from source code analysis). Issues
 * are phrased from the perspective of what the source has relative to the spec:
 *   - "added"   = present in source but missing from spec
 *   - "removed" = present in spec but missing from source
 *   - "changed" = present in both but structurally different
 *
 * @param specModule   - The module AST parsed from the spec file.
 * @param sourceModule - The module AST produced by analyzing source code.
 * @returns An array of DriftIssue objects describing every difference found.
 */
export function detectDrift(
  specModule: ModuleNode,
  sourceModule: ModuleNode,
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  // Module name
  if (specModule.name !== sourceModule.name) {
    issues.push({
      kind: "changed",
      path: "MODULE",
      message: `Module name changed from "${specModule.name}" to "${sourceModule.name}"`,
    });
  }

  // INPUT
  compareFields(
    specModule.input?.fields ?? [],
    sourceModule.input?.fields ?? [],
    "INPUT",
    issues,
  );

  // OUTPUT
  compareFields(
    specModule.output?.fields ?? [],
    sourceModule.output?.fields ?? [],
    "OUTPUT",
    issues,
  );

  // STATE
  compareStateFields(
    specModule.state?.fields ?? [],
    sourceModule.state?.fields ?? [],
    issues,
  );

  // ACTIONS
  compareActions(specModule.actions, sourceModule.actions, issues);

  // ERRORS
  compareErrors(
    specModule.errors?.errors ?? [],
    sourceModule.errors?.errors ?? [],
    issues,
  );

  // DEPENDS
  compareDependencies(
    specModule.depends?.dependencies ?? [],
    sourceModule.depends?.dependencies ?? [],
    issues,
  );

  // INVARIANTS
  compareInvariants(
    specModule.invariants?.rules ?? [],
    sourceModule.invariants?.rules ?? [],
    issues,
  );

  return issues;
}

// ---- Field comparison (INPUT / OUTPUT) ------------------------------------

/**
 * Compare two lists of FieldNodes by name within the given block (INPUT or OUTPUT).
 */
function compareFields(
  specFields: readonly FieldNode[],
  sourceFields: readonly FieldNode[],
  block: string,
  issues: DriftIssue[],
): void {
  const specMap = new Map(specFields.map((f) => [f.name, f]));
  const sourceMap = new Map(sourceFields.map((f) => [f.name, f]));

  // Fields removed from source (present in spec, missing in source)
  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `${block}.${name}`,
        message: `Field "${name}" is defined in the spec ${block} block but missing from source`,
      });
    }
  }

  // Fields added in source (missing in spec, present in source)
  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `${block}.${name}`,
        message: `Field "${name}" exists in source but is not defined in the spec ${block} block`,
      });
    }
  }

  // Fields present in both — check for type / constraint changes
  for (const [name, specField] of specMap) {
    const sourceField = sourceMap.get(name);
    if (!sourceField) continue;

    if (!typesEqual(specField.fieldType, sourceField.fieldType)) {
      issues.push({
        kind: "changed",
        path: `${block}.${name}.type`,
        message: `Field "${name}" in ${block} changed type from ${formatType(specField.fieldType)} to ${formatType(sourceField.fieldType)}`,
      });
    }

    if (!constraintsEqual(specField.constraints, sourceField.constraints)) {
      issues.push({
        kind: "changed",
        path: `${block}.${name}.constraints`,
        message: `Field "${name}" in ${block} has different constraints`,
      });
    }
  }
}

// ---- State field comparison -----------------------------------------------

/** Compare two lists of StateFieldNodes by name. */
function compareStateFields(
  specFields: readonly StateFieldNode[],
  sourceFields: readonly StateFieldNode[],
  issues: DriftIssue[],
): void {
  const specMap = new Map(specFields.map((f) => [f.name, f]));
  const sourceMap = new Map(sourceFields.map((f) => [f.name, f]));

  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `STATE.${name}`,
        message: `State field "${name}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `STATE.${name}`,
        message: `State field "${name}" exists in source but is not defined in the spec`,
      });
    }
  }

  for (const [name, specField] of specMap) {
    const sourceField = sourceMap.get(name);
    if (!sourceField) continue;

    if (specField.access !== sourceField.access) {
      issues.push({
        kind: "changed",
        path: `STATE.${name}.access`,
        message: `State field "${name}" changed access from ${specField.access} to ${sourceField.access}`,
      });
    }

    if (!typesEqual(specField.fieldType, sourceField.fieldType)) {
      issues.push({
        kind: "changed",
        path: `STATE.${name}.type`,
        message: `State field "${name}" changed type from ${formatType(specField.fieldType)} to ${formatType(sourceField.fieldType)}`,
      });
    }
  }
}

// ---- Action comparison ----------------------------------------------------

/** Compare two lists of ActionNodes by name. */
function compareActions(
  specActions: readonly ActionNode[],
  sourceActions: readonly ActionNode[],
  issues: DriftIssue[],
): void {
  const specMap = new Map(specActions.map((a) => [a.name, a]));
  const sourceMap = new Map(sourceActions.map((a) => [a.name, a]));

  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `ACTION.${name}`,
        message: `Action "${name}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `ACTION.${name}`,
        message: `Action "${name}" exists in source but is not defined in the spec`,
      });
    }
  }

  for (const [name, specAction] of specMap) {
    const sourceAction = sourceMap.get(name);
    if (!sourceAction) continue;

    compareActionSignatures(specAction, sourceAction, issues);
  }
}

/** Compare the signatures of two actions with the same name. */
function compareActionSignatures(
  specAction: ActionNode,
  sourceAction: ActionNode,
  issues: DriftIssue[],
): void {
  const name = specAction.name;

  // Return type
  if (!typesEqual(specAction.returnType, sourceAction.returnType)) {
    issues.push({
      kind: "changed",
      path: `ACTION.${name}.returnType`,
      message: `Action "${name}" return type changed from ${formatType(specAction.returnType)} to ${formatType(sourceAction.returnType)}`,
    });
  }

  // Parameters
  compareParameters(specAction.params, sourceAction.params, name, issues);
}

/** Compare two parameter lists for a given action. */
function compareParameters(
  specParams: readonly ParameterNode[],
  sourceParams: readonly ParameterNode[],
  actionName: string,
  issues: DriftIssue[],
): void {
  const specMap = new Map(specParams.map((p) => [p.name, p]));
  const sourceMap = new Map(sourceParams.map((p) => [p.name, p]));

  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `ACTION.${actionName}.params.${name}`,
        message: `Parameter "${name}" of action "${actionName}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `ACTION.${actionName}.params.${name}`,
        message: `Parameter "${name}" of action "${actionName}" exists in source but is not defined in the spec`,
      });
    }
  }

  for (const [name, specParam] of specMap) {
    const sourceParam = sourceMap.get(name);
    if (!sourceParam) continue;

    if (!typesEqual(specParam.paramType, sourceParam.paramType)) {
      issues.push({
        kind: "changed",
        path: `ACTION.${actionName}.params.${name}.type`,
        message: `Parameter "${name}" of action "${actionName}" changed type from ${formatType(specParam.paramType)} to ${formatType(sourceParam.paramType)}`,
      });
    }
  }
}

// ---- Error comparison -----------------------------------------------------

/** Compare two lists of ErrorDefs by name. */
function compareErrors(
  specErrors: readonly ErrorDef[],
  sourceErrors: readonly ErrorDef[],
  issues: DriftIssue[],
): void {
  const specMap = new Map(specErrors.map((e) => [e.name, e]));
  const sourceMap = new Map(sourceErrors.map((e) => [e.name, e]));

  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `ERRORS.${name}`,
        message: `Error "${name}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `ERRORS.${name}`,
        message: `Error "${name}" exists in source but is not defined in the spec`,
      });
    }
  }

  for (const [name, specError] of specMap) {
    const sourceError = sourceMap.get(name);
    if (!sourceError) continue;

    if (specError.status !== sourceError.status) {
      issues.push({
        kind: "changed",
        path: `ERRORS.${name}.status`,
        message: `Error "${name}" status changed from ${String(specError.status ?? "unset")} to ${String(sourceError.status ?? "unset")}`,
      });
    }

    if (specError.message !== sourceError.message) {
      issues.push({
        kind: "changed",
        path: `ERRORS.${name}.message`,
        message: `Error "${name}" message changed from "${specError.message ?? ""}" to "${sourceError.message ?? ""}"`,
      });
    }
  }
}

// ---- Dependency comparison ------------------------------------------------

/** Compare two lists of DependencyDefs by name. */
function compareDependencies(
  specDeps: readonly DependencyDef[],
  sourceDeps: readonly DependencyDef[],
  issues: DriftIssue[],
): void {
  const specMap = new Map(specDeps.map((d) => [d.name, d]));
  const sourceMap = new Map(sourceDeps.map((d) => [d.name, d]));

  for (const [name] of specMap) {
    if (!sourceMap.has(name)) {
      issues.push({
        kind: "removed",
        path: `DEPENDS.${name}`,
        message: `Dependency "${name}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const [name] of sourceMap) {
    if (!specMap.has(name)) {
      issues.push({
        kind: "added",
        path: `DEPENDS.${name}`,
        message: `Dependency "${name}" exists in source but is not defined in the spec`,
      });
    }
  }
}

// ---- Invariant comparison -------------------------------------------------

/** Compare two lists of InvariantRules structurally. */
function compareInvariants(
  specRules: readonly InvariantRule[],
  sourceRules: readonly InvariantRule[],
  issues: DriftIssue[],
): void {
  const specSet = new Set(
    specRules.map((r) => `${r.kind}:${r.description}`),
  );
  const sourceSet = new Set(
    sourceRules.map((r) => `${r.kind}:${r.description}`),
  );

  for (const rule of specRules) {
    const key = `${rule.kind}:${rule.description}`;
    if (!sourceSet.has(key)) {
      issues.push({
        kind: "removed",
        path: `INVARIANTS.${rule.kind}`,
        message: `Invariant ${rule.kind} "${rule.description}" is defined in the spec but missing from source`,
      });
    }
  }

  for (const rule of sourceRules) {
    const key = `${rule.kind}:${rule.description}`;
    if (!specSet.has(key)) {
      issues.push({
        kind: "added",
        path: `INVARIANTS.${rule.kind}`,
        message: `Invariant ${rule.kind} "${rule.description}" exists in source but is not defined in the spec`,
      });
    }
  }
}

// ---- Type equality --------------------------------------------------------

/** Recursively check whether two TypeReferences are structurally equal. */
function typesEqual(a: TypeReference, b: TypeReference): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "primitive":
      return b.kind === "primitive" && a.name === b.name;
    case "list":
      return b.kind === "list" && typesEqual(a.elementType, b.elementType);
    case "map":
      return (
        b.kind === "map" &&
        typesEqual(a.keyType, b.keyType) &&
        typesEqual(a.valueType, b.valueType)
      );
    case "named":
      return b.kind === "named" && a.name === b.name;
    case "optional":
      return b.kind === "optional" && typesEqual(a.innerType, b.innerType);
  }
}

/** Format a TypeReference into a human-readable string for error messages. */
function formatType(typeRef: TypeReference): string {
  switch (typeRef.kind) {
    case "primitive":
      return typeRef.name;
    case "list":
      return `List<${formatType(typeRef.elementType)}>`;
    case "map":
      return `Map<${formatType(typeRef.keyType)}, ${formatType(typeRef.valueType)}>`;
    case "named":
      return typeRef.name;
    case "optional":
      return `${formatType(typeRef.innerType)}?`;
  }
}

// ---- Constraint equality --------------------------------------------------

/** Check whether two Constraints objects are structurally equal. */
function constraintsEqual(
  a: Constraints | undefined,
  b: Constraints | undefined,
): boolean {
  // Both absent
  if (a === undefined && b === undefined) return true;
  // One absent
  if (a === undefined || b === undefined) return false;

  if (a.min !== b.min) return false;
  if (a.max !== b.max) return false;
  if (a.pattern !== b.pattern) return false;
  if (a.format !== b.format) return false;

  // Enum comparison
  if (a.enum === undefined && b.enum === undefined) return true;
  if (a.enum === undefined || b.enum === undefined) return false;
  if (a.enum.length !== b.enum.length) return false;
  const bEnum = b.enum;
  return a.enum.every((v, i) => v === bEnum[i]);
}
