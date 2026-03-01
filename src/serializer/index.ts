// ---------------------------------------------------------------------------
// CodeSpec AST Serializer
//
// Converts a CodeSpec AST (SpecFile / ModuleNode) back into CodeSpec language
// text. This is the inverse of the parser: parse(serialize(ast)) should
// produce an equivalent AST (round-trip fidelity).
//
// Uses the `members` array on ModuleNode to preserve the original declaration
// ordering. All output uses 2-space indentation per nesting level.
// ---------------------------------------------------------------------------

import type {
  SpecFile,
  ModuleNode,
  ModuleMember,
  InputNode,
  OutputNode,
  StateNode,
  StateFieldNode,
  ActionNode,
  InvariantsNode,
  InvariantRule,
  ErrorsNode,
  ErrorDef,
  DependsNode,
  DependencyDef,
  CommentNode,
  StatementNode,
  WhenNode,
  MatchNode,
  MatchArm,
  SetNode,
  CallNode,
  ReturnNode,
  FailNode,
  EmitNode,
  RetryNode,
  LimitNode,
  FieldNode,
  ParameterNode,
  TypeReference,
  Constraints,
} from "../ast/nodes.js";

// ---- Public API -----------------------------------------------------------

/**
 * Serialize a complete SpecFile AST into CodeSpec language text.
 *
 * Top-level comments are emitted before the first module, and modules are
 * separated by blank lines.
 */
export function serializeSpecFile(specFile: SpecFile): string {
  const parts: string[] = [];

  for (const comment of specFile.comments) {
    parts.push(serializeComment(comment, 0));
  }

  for (const mod of specFile.modules) {
    if (parts.length > 0) {
      parts.push("");
    }
    parts.push(serializeModule(mod));
  }

  return parts.join("\n") + "\n";
}

/**
 * Serialize a single ModuleNode into CodeSpec language text.
 *
 * Uses the `members` array to preserve original block ordering for round-trip
 * fidelity.
 */
export function serializeModule(mod: ModuleNode): string {
  const lines: string[] = [];
  lines.push(`MODULE ${mod.name} {`);

  const memberLines = serializeMembers(mod.members, 1);
  if (memberLines.length > 0) {
    lines.push(memberLines);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---- Module members -------------------------------------------------------

/**
 * Serialize an ordered list of module members at the given indentation depth.
 */
function serializeMembers(
  members: readonly ModuleMember[],
  depth: number,
): string {
  const parts: string[] = [];

  for (const member of members) {
    parts.push(serializeMember(member, depth));
  }

  return parts.join("\n\n");
}

/** Serialize a single module member block. */
function serializeMember(member: ModuleMember, depth: number): string {
  switch (member.type) {
    case "Input":
      return serializeInput(member, depth);
    case "Output":
      return serializeOutput(member, depth);
    case "State":
      return serializeState(member, depth);
    case "Action":
      return serializeAction(member, depth);
    case "Invariants":
      return serializeInvariants(member, depth);
    case "Errors":
      return serializeErrors(member, depth);
    case "Depends":
      return serializeDepends(member, depth);
    case "Comment":
      return serializeComment(member, depth);
  }
}

// ---- INPUT / OUTPUT -------------------------------------------------------

/** Serialize an INPUT block. */
function serializeInput(node: InputNode, depth: number): string {
  return serializeFieldBlock("INPUT", node.fields, depth);
}

/** Serialize an OUTPUT block. */
function serializeOutput(node: OutputNode, depth: number): string {
  return serializeFieldBlock("OUTPUT", node.fields, depth);
}

/** Serialize a block that contains typed fields (INPUT or OUTPUT). */
function serializeFieldBlock(
  keyword: string,
  fields: readonly FieldNode[],
  depth: number,
): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];
  lines.push(`${indent}${keyword} {`);

  for (const f of fields) {
    lines.push(serializeField(f, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single typed field (name: Type [constraints]). */
function serializeField(node: FieldNode, depth: number): string {
  const indent = makeIndent(depth);
  let line = `${indent}${node.name}: ${serializeType(node.fieldType)}`;
  if (node.constraints) {
    line += ` ${serializeConstraints(node.constraints)}`;
  }
  return line;
}

// ---- STATE ----------------------------------------------------------------

/** Serialize a STATE block. */
function serializeState(node: StateNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];
  lines.push(`${indent}STATE {`);

  for (const f of node.fields) {
    lines.push(serializeStateField(f, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single state field (READS/WRITES name: Type). */
function serializeStateField(node: StateFieldNode, depth: number): string {
  const indent = makeIndent(depth);
  return `${indent}${node.access} ${node.name}: ${serializeType(node.fieldType)}`;
}

// ---- ACTION ---------------------------------------------------------------

/** Serialize an ACTION block including parameters, return type, and body. */
function serializeAction(node: ActionNode, depth: number): string {
  const indent = makeIndent(depth);
  const params = node.params.map(serializeParameter).join(", ");
  const returnType = serializeType(node.returnType);
  const lines: string[] = [];

  lines.push(
    `${indent}ACTION ${node.name}(${params}) -> ${returnType} {`,
  );

  const bodyText = serializeStatementList(node.body, depth + 1);
  if (bodyText) {
    lines.push(bodyText);
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single action parameter (name: Type [constraints]). */
function serializeParameter(node: ParameterNode): string {
  let text = `${node.name}: ${serializeType(node.paramType)}`;
  if (node.constraints) {
    text += ` ${serializeConstraints(node.constraints)}`;
  }
  return text;
}

// ---- INVARIANTS -----------------------------------------------------------

/** Serialize an INVARIANTS block. */
function serializeInvariants(node: InvariantsNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];
  lines.push(`${indent}INVARIANTS {`);

  for (const rule of node.rules) {
    lines.push(serializeInvariantRule(rule, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single invariant rule (ALWAYS/NEVER "description"). */
function serializeInvariantRule(node: InvariantRule, depth: number): string {
  const indent = makeIndent(depth);
  return `${indent}${node.kind} ${escapeString(node.description)}`;
}

// ---- ERRORS ---------------------------------------------------------------

/** Serialize an ERRORS block. */
function serializeErrors(node: ErrorsNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];
  lines.push(`${indent}ERRORS {`);

  for (const err of node.errors) {
    lines.push(serializeErrorDef(err, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single error definition (Name [status] ["message"]). */
function serializeErrorDef(node: ErrorDef, depth: number): string {
  const indent = makeIndent(depth);
  let line = `${indent}${node.name}`;
  if (node.status !== undefined) {
    line += ` ${String(node.status)}`;
  }
  if (node.message !== undefined) {
    line += ` ${escapeString(node.message)}`;
  }
  return line;
}

// ---- DEPENDS --------------------------------------------------------------

/** Serialize a DEPENDS block. */
function serializeDepends(node: DependsNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];
  lines.push(`${indent}DEPENDS {`);

  for (const dep of node.dependencies) {
    lines.push(serializeDependencyDef(dep, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single dependency definition (Name ["description"]). */
function serializeDependencyDef(node: DependencyDef, depth: number): string {
  const indent = makeIndent(depth);
  let line = `${indent}${node.name}`;
  if (node.description !== undefined) {
    line += ` ${escapeString(node.description)}`;
  }
  return line;
}

// ---- Comments -------------------------------------------------------------

/** Serialize a comment node (-- text). */
function serializeComment(node: CommentNode, depth: number): string {
  const indent = makeIndent(depth);
  return `${indent}-- ${node.text}`;
}

// ---- Statements -----------------------------------------------------------

/**
 * Serialize a list of statements at the given indentation depth.
 *
 * Statements are separated by single newlines. Empty bodies produce an empty
 * string.
 */
function serializeStatementList(
  stmts: readonly StatementNode[],
  depth: number,
): string {
  return stmts.map((s) => serializeStatement(s, depth)).join("\n");
}

/** Serialize a single statement node, dispatching by type. */
function serializeStatement(node: StatementNode, depth: number): string {
  switch (node.type) {
    case "When":
      return serializeWhen(node, depth);
    case "Match":
      return serializeMatch(node, depth);
    case "Set":
      return serializeSet(node, depth);
    case "Call":
      return serializeCall(node, depth);
    case "Return":
      return serializeReturn(node, depth);
    case "Fail":
      return serializeFail(node, depth);
    case "Emit":
      return serializeEmit(node, depth);
    case "Retry":
      return serializeRetry(node, depth);
    case "Limit":
      return serializeLimit(node, depth);
    case "Comment":
      return serializeComment(node, depth);
  }
}

// ---- WHEN / OTHERWISE -----------------------------------------------------

/** Serialize a WHEN statement with optional OTHERWISE clause. */
function serializeWhen(node: WhenNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];

  lines.push(`${indent}WHEN ${node.condition} {`);

  const bodyText = serializeStatementList(node.body, depth + 1);
  if (bodyText) {
    lines.push(bodyText);
  }

  if (node.otherwise && node.otherwise.length > 0) {
    lines.push(`${indent}} OTHERWISE {`);
    const otherwiseText = serializeStatementList(node.otherwise, depth + 1);
    if (otherwiseText) {
      lines.push(otherwiseText);
    }
    lines.push(`${indent}}`);
  } else {
    lines.push(`${indent}}`);
  }

  return lines.join("\n");
}

// ---- MATCH ----------------------------------------------------------------

/** Serialize a MATCH statement with its arms. */
function serializeMatch(node: MatchNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];

  lines.push(`${indent}MATCH ${node.subject} {`);

  for (const arm of node.arms) {
    lines.push(serializeMatchArm(arm, depth + 1));
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Serialize a single MATCH arm. Uses inline form for single-statement bodies. */
function serializeMatchArm(node: MatchArm, depth: number): string {
  const indent = makeIndent(depth);
  const pattern = serializeMatchPattern(node.pattern);

  // Single-statement arms use inline form (no braces)
  if (node.body.length === 1) {
    const stmt = serializeStatement(node.body[0], 0).trimStart();
    return `${indent}${pattern} -> ${stmt}`;
  }

  // Multi-statement arms use block form
  const lines: string[] = [];
  lines.push(`${indent}${pattern} -> {`);

  const bodyText = serializeStatementList(node.body, depth + 1);
  if (bodyText) {
    lines.push(bodyText);
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

/**
 * Serialize a match pattern value.
 *
 * Patterns that are the wildcard `_` or plain identifiers are emitted as-is.
 * All other patterns (string values from the parser) are wrapped in quotes.
 */
function serializeMatchPattern(pattern: string): string {
  if (pattern === "_") {
    return "_";
  }
  // If the pattern looks like a plain identifier, emit as-is
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pattern)) {
    return pattern;
  }
  // Otherwise it was a string literal — wrap in quotes
  return escapeString(pattern);
}

// ---- SET ------------------------------------------------------------------

/** Serialize a SET variable assignment. */
function serializeSet(node: SetNode, depth: number): string {
  const indent = makeIndent(depth);
  return `${indent}SET ${node.variable} = ${node.value}`;
}

// ---- CALL -----------------------------------------------------------------

/** Serialize a standalone CALL statement. */
function serializeCall(node: CallNode, depth: number): string {
  const indent = makeIndent(depth);
  const args = node.args.join(", ");
  return `${indent}CALL ${node.target}(${args})`;
}

// ---- RETURN ---------------------------------------------------------------

/** Serialize a RETURN statement. */
function serializeReturn(node: ReturnNode, depth: number): string {
  const indent = makeIndent(depth);
  return `${indent}RETURN ${node.value}`;
}

// ---- FAIL -----------------------------------------------------------------

/** Serialize a FAIL statement with optional message. */
function serializeFail(node: FailNode, depth: number): string {
  const indent = makeIndent(depth);
  let line = `${indent}FAIL ${node.error}`;
  if (node.message !== undefined) {
    line += ` ${escapeString(node.message)}`;
  }
  return line;
}

// ---- EMIT -----------------------------------------------------------------

/** Serialize an EMIT statement with optional payload. */
function serializeEmit(node: EmitNode, depth: number): string {
  const indent = makeIndent(depth);
  let line = `${indent}EMIT ${node.event}`;
  if (node.payload !== undefined) {
    line += ` { ${node.payload} }`;
  }
  return line;
}

// ---- RETRY / ON_EXHAUST ---------------------------------------------------

/** Serialize a RETRY statement with ON_EXHAUST fallback. */
function serializeRetry(node: RetryNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];

  let header = `${indent}RETRY CALL ${node.target}() ${String(node.attempts)} TIMES`;
  if (node.delay !== undefined) {
    header += ` DELAY ${escapeString(node.delay)}`;
  }
  header += " {";
  lines.push(header);

  const exhaustIndent = makeIndent(depth + 1);
  lines.push(`${exhaustIndent}ON_EXHAUST {`);

  const exhaustBody = serializeStatementList(node.onExhaust, depth + 2);
  if (exhaustBody) {
    lines.push(exhaustBody);
  }

  lines.push(`${exhaustIndent}}`);
  lines.push(`${indent}}`);

  return lines.join("\n");
}

// ---- LIMIT ----------------------------------------------------------------

/** Serialize a LIMIT rate-limiting statement with ON_EXCEED fallback. */
function serializeLimit(node: LimitNode, depth: number): string {
  const indent = makeIndent(depth);
  const lines: string[] = [];

  lines.push(`${indent}LIMIT ${node.rate} PER ${node.per} {`);

  const exceedIndent = makeIndent(depth + 1);
  lines.push(`${exceedIndent}ON_EXCEED {`);

  const exceedBody = serializeStatementList(node.onExceed, depth + 2);
  if (exceedBody) {
    lines.push(exceedBody);
  }

  lines.push(`${exceedIndent}}`);
  lines.push(`${indent}}`);

  return lines.join("\n");
}

// ---- Types ----------------------------------------------------------------

/** Serialize a type reference to its CodeSpec text representation. */
export function serializeType(typeRef: TypeReference): string {
  switch (typeRef.kind) {
    case "primitive":
      return typeRef.name;
    case "list":
      return `List<${serializeType(typeRef.elementType)}>`;
    case "map":
      return `Map<${serializeType(typeRef.keyType)}, ${serializeType(typeRef.valueType)}>`;
    case "named":
      return typeRef.name;
    case "optional":
      return `${serializeType(typeRef.innerType)}?`;
  }
}

// ---- Constraints ----------------------------------------------------------

/** Serialize a constraints object to its CodeSpec bracket notation. */
export function serializeConstraints(c: Constraints): string {
  const parts: string[] = [];

  if (c.min !== undefined) {
    parts.push(`min:${formatNumber(c.min)}`);
  }
  if (c.max !== undefined) {
    parts.push(`max:${formatNumber(c.max)}`);
  }
  if (c.pattern !== undefined) {
    parts.push(`pattern:${escapeString(c.pattern)}`);
  }
  if (c.format !== undefined) {
    parts.push(`format:${c.format}`);
  }
  if (c.enum !== undefined) {
    const values = c.enum.map(escapeString).join(",");
    parts.push(`enum:(${values})`);
  }

  return `[${parts.join(", ")}]`;
}

// ---- Helpers --------------------------------------------------------------

/** Create a 2-space indentation string for the given nesting depth. */
function makeIndent(depth: number): string {
  return "  ".repeat(depth);
}

/**
 * Escape a string value for CodeSpec output, wrapping it in double quotes.
 *
 * Backslashes and double quotes inside the string are escaped.
 */
function escapeString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Format a number for constraint output.
 *
 * Integers are emitted without a decimal point. Floats keep their decimal
 * representation.
 */
function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
