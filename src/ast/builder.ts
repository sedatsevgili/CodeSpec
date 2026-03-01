// ---------------------------------------------------------------------------
// CodeSpec AST Builder Helpers
//
// Factory functions for constructing all AST nodes. These enforce runtime
// invariants that the type system alone cannot express (e.g. positive retry
// attempts, non-empty module names). Each builder accepts a plain object
// without the `type` discriminant — the builder adds it.
// ---------------------------------------------------------------------------

import type {
  SourceRange,
  PrimitiveTypeName,
  PrimitiveType,
  ListType,
  MapType,
  NamedType,
  OptionalType,
  TypeReference,
  Constraints,
  FieldNode,
  ParameterNode,
  InputNode,
  OutputNode,
  StateAccess,
  StateFieldNode,
  StateNode,
  WhenNode,
  MatchArm,
  MatchNode,
  SetNode,
  CallNode,
  ReturnNode,
  FailNode,
  EmitNode,
  RetryNode,
  LimitNode,
  CommentNode,
  StatementNode,
  ActionNode,
  InvariantRule,
  InvariantsNode,
  ErrorDef,
  ErrorsNode,
  DependencyDef,
  DependsNode,
  ModuleMember,
  ModuleNode,
  SpecFile,
} from "./nodes.js";

// ---- Type helpers ----------------------------------------------------------

/** Create a primitive type reference. */
export function primitiveType(name: PrimitiveTypeName): PrimitiveType {
  return { kind: "primitive", name };
}

/** Create a List<T> collection type reference. */
export function listType(elementType: TypeReference): ListType {
  return { kind: "list", elementType };
}

/** Create a Map<K, V> collection type reference. */
export function mapType(
  keyType: TypeReference,
  valueType: TypeReference,
): MapType {
  return { kind: "map", keyType, valueType };
}

/** Create a named (custom) type reference. */
export function namedType(name: string): NamedType {
  return { kind: "named", name };
}

/** Create an optional wrapper around a type reference. */
export function optionalType(innerType: TypeReference): OptionalType {
  return { kind: "optional", innerType };
}

// ---- Constraints -----------------------------------------------------------

/** Create a constraints object, omitting undefined values. */
export function constraints(args: {
  min?: number;
  max?: number;
  pattern?: string;
  format?: string;
  enum?: readonly string[];
}): Constraints {
  const result: {
    min?: number;
    max?: number;
    pattern?: string;
    format?: string;
    enum?: readonly string[];
  } = {};
  if (args.min !== undefined) result.min = args.min;
  if (args.max !== undefined) result.max = args.max;
  if (args.pattern !== undefined) result.pattern = args.pattern;
  if (args.format !== undefined) result.format = args.format;
  if (args.enum !== undefined) result.enum = args.enum;
  return result;
}

// ---- Fields & parameters ---------------------------------------------------

/** Create a typed field node (used inside INPUT and OUTPUT blocks). */
export function field(args: {
  name: string;
  fieldType: TypeReference;
  constraints?: Constraints;
  description?: string;
  loc?: SourceRange;
}): FieldNode {
  return { type: "Field", ...args };
}

/** Create a parameter node for an ACTION. */
export function parameter(args: {
  name: string;
  paramType: TypeReference;
  constraints?: Constraints;
  loc?: SourceRange;
}): ParameterNode {
  return { type: "Parameter", ...args };
}

// ---- Top-level blocks ------------------------------------------------------

/** Create an INPUT block with the given fields. */
export function input(args: {
  fields: readonly FieldNode[];
  loc?: SourceRange;
}): InputNode {
  return { type: "Input", ...args };
}

/** Create an OUTPUT block with the given fields. */
export function output(args: {
  fields: readonly FieldNode[];
  loc?: SourceRange;
}): OutputNode {
  return { type: "Output", ...args };
}

/** Create a state field declaration with access mode. */
export function stateField(args: {
  access: StateAccess;
  name: string;
  fieldType: TypeReference;
  loc?: SourceRange;
}): StateFieldNode {
  return { type: "StateField", ...args };
}

/** Create a STATE block with the given state field declarations. */
export function state(args: {
  fields: readonly StateFieldNode[];
  loc?: SourceRange;
}): StateNode {
  return { type: "State", ...args };
}

// ---- Action body statements ------------------------------------------------

/** Create a WHEN / OTHERWISE conditional guard. */
export function when(args: {
  condition: string;
  body: readonly StatementNode[];
  otherwise?: readonly StatementNode[];
  loc?: SourceRange;
}): WhenNode {
  return { type: "When", ...args };
}

/** Create a single arm for a MATCH expression. */
export function matchArm(args: {
  pattern: string;
  body: readonly StatementNode[];
  loc?: SourceRange;
}): MatchArm {
  return { type: "MatchArm", ...args };
}

/** Create a MATCH pattern-matching node. */
export function match(args: {
  subject: string;
  arms: readonly MatchArm[];
  loc?: SourceRange;
}): MatchNode {
  return { type: "Match", ...args };
}

/** Create a SET variable assignment node. */
export function set(args: {
  variable: string;
  value: string;
  loc?: SourceRange;
}): SetNode {
  return { type: "Set", ...args };
}

/** Create a CALL node that invokes a dependency or internal action. */
export function call(args: {
  target: string;
  args: readonly string[];
  assignTo?: string;
  loc?: SourceRange;
}): CallNode {
  return { type: "Call", ...args };
}

/** Create a RETURN node. */
export function returnNode(args: {
  value: string;
  loc?: SourceRange;
}): ReturnNode {
  return { type: "Return", ...args };
}

/** Create a FAIL node that raises a named error. */
export function fail(args: {
  error: string;
  message?: string;
  loc?: SourceRange;
}): FailNode {
  return { type: "Fail", ...args };
}

/** Create an EMIT node that fires a domain event. */
export function emit(args: {
  event: string;
  payload?: string;
  loc?: SourceRange;
}): EmitNode {
  return { type: "Emit", ...args };
}

/**
 * Create a RETRY node with retry logic and ON_EXHAUST fallback.
 *
 * @throws {Error} If `attempts` is not a positive integer.
 */
export function retry(args: {
  target: string;
  attempts: number;
  delay?: string;
  onExhaust: readonly StatementNode[];
  loc?: SourceRange;
}): RetryNode {
  if (!Number.isInteger(args.attempts) || args.attempts < 1) {
    throw new Error(
      `RetryNode requires a positive integer for attempts, got ${String(args.attempts)}`,
    );
  }
  return { type: "Retry", ...args };
}

/**
 * Create a LIMIT rate-limiting node.
 *
 * @throws {Error} If `rate` or `per` is empty.
 */
export function limit(args: {
  rate: string;
  per: string;
  onExceed: readonly StatementNode[];
  loc?: SourceRange;
}): LimitNode {
  if (!args.rate) {
    throw new Error("LimitNode requires a non-empty rate");
  }
  if (!args.per) {
    throw new Error("LimitNode requires a non-empty per");
  }
  return { type: "Limit", ...args };
}

/** Create a comment node (-- style). */
export function comment(args: {
  text: string;
  loc?: SourceRange;
}): CommentNode {
  return { type: "Comment", ...args };
}

// ---- ACTION ----------------------------------------------------------------

/** Create an ACTION node representing a behavioral unit. */
export function action(args: {
  name: string;
  params: readonly ParameterNode[];
  returnType: TypeReference;
  body: readonly StatementNode[];
  loc?: SourceRange;
}): ActionNode {
  return { type: "Action", ...args };
}

// ---- INVARIANTS ------------------------------------------------------------

/** Create a single invariant rule (ALWAYS or NEVER). */
export function invariantRule(args: {
  kind: "ALWAYS" | "NEVER";
  description: string;
}): InvariantRule {
  return { type: "InvariantRule", ...args };
}

/** Create an INVARIANTS block with behavioral guarantees. */
export function invariants(args: {
  rules: readonly InvariantRule[];
  loc?: SourceRange;
}): InvariantsNode {
  return { type: "Invariants", ...args };
}

// ---- ERRORS ----------------------------------------------------------------

/** Create a single named error definition with optional HTTP status. */
export function errorDef(args: {
  name: string;
  status?: number;
  message?: string;
}): ErrorDef {
  return { type: "ErrorDef", ...args };
}

/** Create an ERRORS block containing named error types. */
export function errors(args: {
  errors: readonly ErrorDef[];
  loc?: SourceRange;
}): ErrorsNode {
  return { type: "Errors", ...args };
}

// ---- DEPENDS ---------------------------------------------------------------

/** Create a single external dependency declaration. */
export function dependencyDef(args: {
  name: string;
  description?: string;
}): DependencyDef {
  return { type: "DependencyDef", ...args };
}

/** Create a DEPENDS block listing external service dependencies. */
export function depends(args: {
  dependencies: readonly DependencyDef[];
  loc?: SourceRange;
}): DependsNode {
  return { type: "Depends", ...args };
}

// ---- MODULE ----------------------------------------------------------------

/**
 * Create a MODULE node — the top-level container for a CodeSpec specification.
 *
 * The builder auto-populates the convenience accessors (`input`, `output`,
 * `state`, `actions`, `invariants`, `errors`, `depends`) by scanning the
 * `members` array, so callers only need to supply `name` and `members`.
 *
 * @throws {Error} If `name` is empty.
 * @throws {Error} If more than one INPUT, OUTPUT, STATE, INVARIANTS, ERRORS,
 *   or DEPENDS block is present in `members`.
 */
export function module(args: {
  name: string;
  members: readonly ModuleMember[];
  loc?: SourceRange;
}): ModuleNode {
  if (!args.name) {
    throw new Error("ModuleNode requires a non-empty name");
  }

  let inputNode: InputNode | undefined;
  let outputNode: OutputNode | undefined;
  let stateNode: StateNode | undefined;
  const actionNodes: ActionNode[] = [];
  let invariantsNode: InvariantsNode | undefined;
  let errorsNode: ErrorsNode | undefined;
  let dependsNode: DependsNode | undefined;

  for (const member of args.members) {
    switch (member.type) {
      case "Input":
        if (inputNode) {
          throw new Error("ModuleNode may only contain one INPUT block");
        }
        inputNode = member;
        break;
      case "Output":
        if (outputNode) {
          throw new Error("ModuleNode may only contain one OUTPUT block");
        }
        outputNode = member;
        break;
      case "State":
        if (stateNode) {
          throw new Error("ModuleNode may only contain one STATE block");
        }
        stateNode = member;
        break;
      case "Action":
        actionNodes.push(member);
        break;
      case "Invariants":
        if (invariantsNode) {
          throw new Error("ModuleNode may only contain one INVARIANTS block");
        }
        invariantsNode = member;
        break;
      case "Errors":
        if (errorsNode) {
          throw new Error("ModuleNode may only contain one ERRORS block");
        }
        errorsNode = member;
        break;
      case "Depends":
        if (dependsNode) {
          throw new Error("ModuleNode may only contain one DEPENDS block");
        }
        dependsNode = member;
        break;
      case "Comment":
        // Comments are kept in members for serialization but not extracted.
        break;
    }
  }

  const result: ModuleNode = {
    type: "Module",
    name: args.name,
    members: args.members,
    actions: actionNodes,
    ...(inputNode !== undefined && { input: inputNode }),
    ...(outputNode !== undefined && { output: outputNode }),
    ...(stateNode !== undefined && { state: stateNode }),
    ...(invariantsNode !== undefined && { invariants: invariantsNode }),
    ...(errorsNode !== undefined && { errors: errorsNode }),
    ...(dependsNode !== undefined && { depends: dependsNode }),
    ...(args.loc !== undefined && { loc: args.loc }),
  };

  return result;
}

// ---- SPEC FILE -------------------------------------------------------------

/**
 * Create a SpecFile — the root of a CodeSpec document containing one or more modules.
 *
 * Top-level comments are separated from modules automatically if the caller
 * supplies both in the `modules` list, but the preferred approach is to pass
 * them explicitly via `comments`.
 */
export function specFile(args: {
  modules: readonly ModuleNode[];
  comments?: readonly CommentNode[];
}): SpecFile {
  return {
    type: "SpecFile",
    modules: args.modules,
    comments: args.comments ?? [],
  };
}
