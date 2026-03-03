// ---------------------------------------------------------------------------
// TypeScript Analyzer
//
// Reads TypeScript source code and produces a CodeSpec AST using pure static
// analysis via ts-morph. Fully deterministic: same input code always produces
// the same AST output. No AI, no API calls, no randomness.
// ---------------------------------------------------------------------------

import {
  Project,
  SourceFile,
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type MethodDeclaration,
  type InterfaceDeclaration,
  type TypeAliasDeclaration,
  type ParameterDeclaration,
  type PropertySignature,
  type TypeNode,
  type Statement,
  type IfStatement,
  type SwitchStatement,
  type ThrowStatement,
  type ReturnStatement as TsReturnStatement,
  type VariableStatement,
  type ExpressionStatement,
  type TryStatement,
  type CallExpression,
  type Block,
  type CaseClause,
  type DefaultClause,
  type ImportDeclaration,
} from "ts-morph";

import type {
  ModuleNode,
  ModuleMember,
  TypeReference,
  FieldNode,
  StatementNode,
  ActionNode,
  InputNode,
  OutputNode,
  DependsNode,
  StateNode,
} from "../ast/nodes.js";

import {
  primitiveType,
  listType,
  mapType,
  namedType,
  optionalType,
  field,
  parameter,
  input,
  output,
  action,
  when,
  matchArm,
  match,
  set,
  call,
  returnNode,
  fail,
  emit,
  depends,
  dependencyDef,
  state,
  stateField,
  module as moduleNode,
} from "../ast/builder.js";

// ---- Public API -----------------------------------------------------------

/**
 * Analyze a TypeScript file on disk and produce a CodeSpec ModuleNode.
 *
 * The module name is derived from the file name (without extension), converted
 * to PascalCase.
 */
export function analyzeTypeScript(filePath: string): ModuleNode {
  const project = new Project({
    compilerOptions: { strict: true },
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFile = project.addSourceFileAtPath(filePath);
  return analyzeSourceFile(sourceFile);
}

/**
 * Analyze TypeScript source code provided as a string and produce a CodeSpec
 * ModuleNode.
 *
 * This is useful for testing without writing files to disk.
 *
 * @param source  - The TypeScript source code to analyze.
 * @param fileName - An optional virtual file name (defaults to "module.ts").
 */
export function analyzeTypeScriptSource(
  source: string,
  fileName?: string,
): ModuleNode {
  const project = new Project({
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  });
  const name = fileName ?? "module.ts";
  const sourceFile = project.createSourceFile(name, source);
  return analyzeSourceFile(sourceFile);
}

// ---- Core analysis --------------------------------------------------------

/**
 * Analyze a ts-morph SourceFile and produce a CodeSpec ModuleNode.
 *
 * Extraction order is deterministic: imports (DEPENDS), interfaces
 * (INPUT/OUTPUT), classes (methods -> ACTIONs), top-level functions (ACTIONs),
 * then STATE from detected patterns.
 */
function analyzeSourceFile(sourceFile: SourceFile): ModuleNode {
  const moduleName = deriveModuleName(sourceFile.getBaseName());

  const members: ModuleMember[] = [];
  const dependencyNames = new Set<string>();
  const stateReads = new Map<string, TypeReference>();
  const stateWrites = new Map<string, TypeReference>();

  // 1. Extract dependencies from imports
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    collectDependencies(imp, dependencyNames);
  }

  // 2. Extract interfaces -> INPUT / OUTPUT / named types
  const interfaces = sourceFile.getInterfaces();
  for (const iface of interfaces) {
    const block = analyzeInterface(iface);
    if (block) {
      members.push(block);
    }
  }

  // 3. Extract type aliases (only exported ones that look like Input/Output)
  const typeAliases = sourceFile.getTypeAliases();
  for (const alias of typeAliases) {
    const block = analyzeTypeAlias(alias);
    if (block) {
      members.push(block);
    }
  }

  // 4. Extract class methods as ACTIONs
  const classes = sourceFile.getClasses();
  for (const cls of classes) {
    const methods = cls.getMethods();
    for (const method of methods) {
      const actionNode = analyzeMethod(method, dependencyNames, stateReads, stateWrites);
      members.push(actionNode);
    }
  }

  // 5. Extract top-level functions as ACTIONs
  const functions = sourceFile.getFunctions();
  for (const fn of functions) {
    const actionNode = analyzeFunction(fn, dependencyNames, stateReads, stateWrites);
    members.push(actionNode);
  }

  // 6. Build STATE block from detected reads/writes
  const stateNode = buildStateNode(stateReads, stateWrites);
  if (stateNode) {
    members.unshift(stateNode);
  }

  // 7. Build DEPENDS block from collected dependencies
  const dependsNode = buildDependsNode(dependencyNames);
  if (dependsNode) {
    members.push(dependsNode);
  }

  return moduleNode({ name: moduleName, members });
}

// ---- Module name derivation -----------------------------------------------

/**
 * Derive a PascalCase module name from a file name.
 *
 * "user-service.ts" -> "UserService"
 * "userService.ts"  -> "UserService"
 * "module.ts"       -> "Module"
 */
function deriveModuleName(fileName: string): string {
  // Remove extension
  const base = fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
  // Split on hyphens, underscores, dots, or camelCase boundaries
  const words = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_.\s]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

// ---- Type mapping ---------------------------------------------------------

/**
 * Map a TypeScript type node to a CodeSpec TypeReference.
 *
 * Handles primitives (string, number, boolean, void), Date/DateTime,
 * Array<T>/T[], Map<K,V>, optional types (T | undefined), and falls back
 * to NamedType for everything else.
 */
function mapTypeNode(typeNode: TypeNode | undefined): TypeReference {
  if (!typeNode) {
    return primitiveType("Void");
  }

  const text = typeNode.getText().trim();

  // Handle union types that include undefined -> Optional
  if (Node.isUnionTypeNode(typeNode)) {
    const unionTypes = typeNode.getTypeNodes();
    const nonUndefined = unionTypes.filter(
      (t) => t.getText().trim() !== "undefined" && t.getText().trim() !== "null",
    );
    if (nonUndefined.length === 1 && nonUndefined.length < unionTypes.length) {
      return optionalType(mapTypeNode(nonUndefined[0]));
    }
    // For other unions, use the text as a named type
    return namedType(text);
  }

  // Handle array type syntax: T[]
  if (Node.isArrayTypeNode(typeNode)) {
    const elementTypeNode = typeNode.getElementTypeNode();
    return listType(mapTypeNode(elementTypeNode));
  }

  // Handle generic type references: Array<T>, Map<K,V>, Promise<T>, etc.
  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName().getText();
    const typeArgs = typeNode.getTypeArguments();

    if (typeName === "Array" && typeArgs.length === 1) {
      return listType(mapTypeNode(typeArgs[0]));
    }

    if (typeName === "Map" && typeArgs.length === 2) {
      return mapType(mapTypeNode(typeArgs[0]), mapTypeNode(typeArgs[1]));
    }

    if (typeName === "Promise" && typeArgs.length === 1) {
      return mapTypeNode(typeArgs[0]);
    }

    if (typeName === "Set" && typeArgs.length === 1) {
      return listType(mapTypeNode(typeArgs[0]));
    }

    if (typeName === "Record" && typeArgs.length === 2) {
      return mapType(mapTypeNode(typeArgs[0]), mapTypeNode(typeArgs[1]));
    }

    if (typeName === "Date") {
      return primitiveType("DateTime");
    }

    return namedType(typeName);
  }

  // Primitive keyword types
  return mapPrimitiveText(text);
}

/** Map a simple type text to a CodeSpec primitive or named type. */
function mapPrimitiveText(text: string): TypeReference {
  switch (text) {
    case "string":
      return primitiveType("String");
    case "number":
      return primitiveType("Int");
    case "boolean":
      return primitiveType("Bool");
    case "void":
      return primitiveType("Void");
    case "undefined":
      return primitiveType("Void");
    case "Date":
      return primitiveType("DateTime");
    case "never":
      return primitiveType("Void");
    default:
      return namedType(text);
  }
}

/**
 * Map a TypeScript return type from a function/method declaration.
 *
 * If the return type annotation exists, use it. Otherwise fall back to Void.
 */
function mapReturnType(
  decl: FunctionDeclaration | MethodDeclaration,
): TypeReference {
  const returnTypeNode = decl.getReturnTypeNode();
  if (returnTypeNode) {
    return mapTypeNode(returnTypeNode);
  }
  // No explicit return type annotation; default to Void
  return primitiveType("Void");
}

// ---- Interface analysis ---------------------------------------------------

/**
 * Analyze a TypeScript interface and classify it as INPUT, OUTPUT, or skip it.
 *
 * Heuristic:
 * - Names containing "Input" or "Request" (case-insensitive) -> INPUT
 * - Names containing "Output" or "Response" (case-insensitive) -> OUTPUT
 * - Exported interfaces without these patterns -> OUTPUT (default)
 * - Non-exported interfaces are skipped
 */
function analyzeInterface(
  iface: InterfaceDeclaration,
): InputNode | OutputNode | undefined {
  if (!iface.isExported()) {
    return undefined;
  }

  const name = iface.getName();
  const fields = iface.getProperties().map(analyzePropertySignature);
  const classification = classifyInterfaceName(name);

  if (classification === "input") {
    return input({ fields });
  }
  return output({ fields });
}

/** Analyze a property signature from an interface into a FieldNode. */
function analyzePropertySignature(prop: PropertySignature): FieldNode {
  const name = prop.getName();
  const typeNode = prop.getTypeNode();
  let fieldType = mapTypeNode(typeNode);

  // If the property has a question mark, wrap in optional
  if (prop.hasQuestionToken() && fieldType.kind !== "optional") {
    fieldType = optionalType(fieldType);
  }

  return field({ name, fieldType });
}

/**
 * Classify an interface name as "input" or "output" based on naming patterns.
 */
function classifyInterfaceName(name: string): "input" | "output" {
  const lower = name.toLowerCase();
  if (lower.includes("input") || lower.includes("request")) {
    return "input";
  }
  return "output";
}

// ---- Type alias analysis --------------------------------------------------

/**
 * Analyze a type alias. Only exported type aliases with object literal types
 * that match INPUT/OUTPUT naming patterns are processed.
 */
function analyzeTypeAlias(
  alias: TypeAliasDeclaration,
): InputNode | OutputNode | undefined {
  if (!alias.isExported()) {
    return undefined;
  }

  const name = alias.getName();
  const typeNode = alias.getTypeNode();

  if (!typeNode || !Node.isTypeLiteral(typeNode)) {
    return undefined;
  }

  const fields = typeNode.getProperties().map(analyzePropertySignature);
  const classification = classifyInterfaceName(name);

  if (classification === "input") {
    return input({ fields });
  }
  return output({ fields });
}

// ---- Function / method analysis -------------------------------------------

/**
 * Analyze a top-level function declaration and produce an ActionNode.
 */
function analyzeFunction(
  fn: FunctionDeclaration,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ActionNode {
  const name = fn.getName() ?? "anonymous";
  const params = fn.getParameters().map(analyzeParameter);
  const returnType = mapReturnType(fn);
  const body = fn.getBody();
  const statements: StatementNode[] = [];

  if (body && Node.isBlock(body)) {
    analyzeBlock(body, statements, depNames, stateReads, stateWrites);
  }

  return action({ name, params, returnType, body: statements });
}

/**
 * Analyze a class method declaration and produce an ActionNode.
 */
function analyzeMethod(
  method: MethodDeclaration,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ActionNode {
  const name = method.getName();
  const params = method.getParameters().map(analyzeParameter);
  const returnType = mapReturnType(method);
  const body = method.getBody();
  const statements: StatementNode[] = [];

  if (body && Node.isBlock(body)) {
    analyzeBlock(body, statements, depNames, stateReads, stateWrites);
  }

  return action({ name, params, returnType, body: statements });
}

/** Analyze a function/method parameter into a ParameterNode. */
function analyzeParameter(param: ParameterDeclaration) {
  const name = param.getName();
  const typeNode = param.getTypeNode();
  let paramType = mapTypeNode(typeNode);

  if (param.hasQuestionToken() && paramType.kind !== "optional") {
    paramType = optionalType(paramType);
  }

  return parameter({ name, paramType });
}

// ---- Statement analysis (function bodies) ---------------------------------

/**
 * Analyze a block of TypeScript statements and produce CodeSpec StatementNodes.
 *
 * This is the core of the analyzer: it maps TypeScript control flow and
 * expressions to CodeSpec statements.
 */
function analyzeBlock(
  block: Block,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  for (const stmt of block.getStatements()) {
    analyzeStatement(stmt, out, depNames, stateReads, stateWrites);
  }
}

/**
 * Analyze a single TypeScript statement and append CodeSpec nodes to `out`.
 */
function analyzeStatement(
  stmt: Statement,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  // if / else -> WHEN / OTHERWISE
  if (Node.isIfStatement(stmt)) {
    out.push(analyzeIfStatement(stmt, depNames, stateReads, stateWrites));
    return;
  }

  // switch -> MATCH
  if (Node.isSwitchStatement(stmt)) {
    out.push(analyzeSwitchStatement(stmt, depNames, stateReads, stateWrites));
    return;
  }

  // throw -> FAIL
  if (Node.isThrowStatement(stmt)) {
    out.push(analyzeThrowStatement(stmt));
    return;
  }

  // return -> RETURN
  if (Node.isReturnStatement(stmt)) {
    out.push(analyzeReturnStatement(stmt));
    return;
  }

  // variable declaration -> SET (or SET with CALL)
  if (Node.isVariableStatement(stmt)) {
    analyzeVariableStatement(stmt, out, depNames, stateReads, stateWrites);
    return;
  }

  // expression statement -> CALL, EMIT, or state access
  if (Node.isExpressionStatement(stmt)) {
    analyzeExpressionStatement(stmt, out, depNames, stateReads, stateWrites);
    return;
  }

  // try/catch -> body + FAIL for catch
  if (Node.isTryStatement(stmt)) {
    analyzeTryStatement(stmt, out, depNames, stateReads, stateWrites);
    return;
  }
}

// ---- if/else -> WHEN/OTHERWISE --------------------------------------------

/** Analyze an if statement into a WhenNode with optional OTHERWISE. */
function analyzeIfStatement(
  stmt: IfStatement,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): StatementNode {
  const condition = stmt.getExpression().getText();
  const thenBlock = stmt.getThenStatement();
  const elseBlock = stmt.getElseStatement();

  const body: StatementNode[] = [];
  if (Node.isBlock(thenBlock)) {
    analyzeBlock(thenBlock, body, depNames, stateReads, stateWrites);
  } else {
    analyzeStatement(thenBlock, body, depNames, stateReads, stateWrites);
  }

  let otherwise: StatementNode[] | undefined;
  if (elseBlock) {
    otherwise = [];
    if (Node.isBlock(elseBlock)) {
      analyzeBlock(elseBlock, otherwise, depNames, stateReads, stateWrites);
    } else {
      analyzeStatement(elseBlock, otherwise, depNames, stateReads, stateWrites);
    }
  }

  return when({ condition, body, otherwise });
}

// ---- switch -> MATCH ------------------------------------------------------

/** Analyze a switch statement into a MatchNode. */
function analyzeSwitchStatement(
  stmt: SwitchStatement,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): StatementNode {
  const subject = stmt.getExpression().getText();
  const clauses = stmt.getClauses();
  const arms = clauses.map((clause) =>
    analyzeSwitchClause(clause, depNames, stateReads, stateWrites),
  );

  return match({ subject, arms });
}

/** Analyze a single case/default clause into a MatchArm. */
function analyzeSwitchClause(
  clause: CaseClause | DefaultClause,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
) {
  let pattern: string;
  if (Node.isCaseClause(clause)) {
    const expr = clause.getExpression();
    pattern = expr.getText().replace(/^["']|["']$/g, "");
  } else {
    pattern = "_";
  }

  const body: StatementNode[] = [];
  for (const stmt of clause.getStatements()) {
    analyzeStatement(stmt, body, depNames, stateReads, stateWrites);
  }
  // Filter out break statements (they don't map to CodeSpec)
  // Break statements are not recognized as statement nodes, so they are
  // naturally skipped by analyzeStatement

  return matchArm({ pattern, body });
}

// ---- throw -> FAIL --------------------------------------------------------

/** Analyze a throw statement into a FailNode. */
function analyzeThrowStatement(stmt: ThrowStatement): StatementNode {
  const expr = stmt.getExpression();
  if (!expr) {
    return fail({ error: "UnknownError" });
  }

  // throw new ErrorType("message")
  if (Node.isNewExpression(expr)) {
    const errorName = expr.getExpression().getText();
    const args = expr.getArguments();
    const message =
      args.length > 0 ? args[0].getText().replace(/^["']|["']$/g, "") : undefined;
    return fail({ error: errorName, message });
  }

  // throw expression (fallback)
  return fail({ error: expr.getText() });
}

// ---- return -> RETURN -----------------------------------------------------

/** Analyze a return statement into a ReturnNode. */
function analyzeReturnStatement(stmt: TsReturnStatement): StatementNode {
  const expr = stmt.getExpression();
  const value = expr ? toCodeSpecExpr(expr.getText()) : "void";
  return returnNode({ value });
}

// ---- variable declarations -> SET -----------------------------------------

/**
 * Analyze a variable statement (const/let/var declarations) into SET nodes.
 *
 * If the initializer is a function call, it becomes SET x = CALL fn(...).
 * If the initializer is an await expression wrapping a call, same treatment.
 * Otherwise it becomes SET x = <expression text>.
 */
function analyzeVariableStatement(
  stmt: VariableStatement,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  for (const decl of stmt.getDeclarations()) {
    const varName = decl.getName();
    const initializer = decl.getInitializer();

    if (!initializer) {
      out.push(set({ variable: varName, value: "undefined" }));
      continue;
    }

    // Check for call expression patterns and state access
    const callResult = tryExtractCallExpression(initializer, depNames, stateReads, stateWrites);
    if (callResult) {
      out.push(call({ target: callResult.target, args: callResult.args, assignTo: varName }));
      continue;
    }

    // Check if it is an await expression wrapping a call
    if (Node.isAwaitExpression(initializer)) {
      const awaitedExpr = initializer.getExpression();
      const awaitCallResult = tryExtractCallExpression(awaitedExpr, depNames, stateReads, stateWrites);
      if (awaitCallResult) {
        out.push(
          call({
            target: awaitCallResult.target,
            args: awaitCallResult.args,
            assignTo: varName,
          }),
        );
        continue;
      }
    }

    out.push(set({ variable: varName, value: toCodeSpecExpr(initializer.getText()) }));
  }
}

// ---- expression statements -> CALL / EMIT / state access ------------------

/**
 * Analyze an expression statement. Handles:
 * - Function calls -> CALL
 * - Event emitter calls (emit/dispatch/fire) -> EMIT
 * - Database/store access -> STATE tracking
 * - Await expressions wrapping calls
 */
function analyzeExpressionStatement(
  stmt: ExpressionStatement,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  const expr = stmt.getExpression();

  // Handle await expression
  let innerExpr = expr;
  if (Node.isAwaitExpression(expr)) {
    innerExpr = expr.getExpression();
  }

  // Check for emit patterns: obj.emit("event", payload) or emit("event")
  const emitResult = tryExtractEmit(innerExpr);
  if (emitResult) {
    out.push(emitResult);
    return;
  }

  // Check for call expressions
  const callResult = tryExtractCallExpression(innerExpr, depNames, stateReads, stateWrites);
  if (callResult) {
    out.push(call({ target: callResult.target, args: callResult.args }));
    return;
  }

  // Assignment expression: x = value
  if (Node.isBinaryExpression(innerExpr)) {
    const opToken = innerExpr.getOperatorToken();
    if (opToken.getKind() === SyntaxKind.EqualsToken) {
      const left = innerExpr.getLeft().getText();
      const right = innerExpr.getRight();

      const rightCallResult = tryExtractCallExpression(right, depNames, stateReads, stateWrites);
      if (rightCallResult) {
        out.push(
          call({
            target: rightCallResult.target,
            args: rightCallResult.args,
            assignTo: left,
          }),
        );
        return;
      }

      out.push(set({ variable: left, value: right.getText() }));
      return;
    }
  }
}

// ---- try/catch -> body statements + error handling ------------------------

/** Analyze a try/catch statement. */
function analyzeTryStatement(
  stmt: TryStatement,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  // Analyze the try block body
  const tryBlock = stmt.getTryBlock();
  analyzeBlock(tryBlock, out, depNames, stateReads, stateWrites);

  // Analyze the catch clause
  const catchClause = stmt.getCatchClause();
  if (catchClause) {
    const catchBody: StatementNode[] = [];
    analyzeBlock(catchClause.getBlock(), catchBody, depNames, stateReads, stateWrites);
    // If the catch body contains statements, wrap them in a WHEN with the
    // error variable as condition
    if (catchBody.length > 0) {
      const catchVar = catchClause.getVariableDeclaration();
      const condition = catchVar ? `error is ${catchVar.getName()}` : "error";
      out.push(when({ condition, body: catchBody }));
    }
  }
}

// ---- Call expression extraction -------------------------------------------

interface ExtractedCall {
  readonly target: string;
  readonly args: readonly string[];
}

/**
 * Try to extract a call expression from a node. Handles:
 * - Direct calls: fn(args)
 * - Method calls: obj.method(args)
 * - Chained calls: obj.method(args).then(...)
 *
 * Also detects state access patterns (db.find, store.get, etc.) and
 * dependency calls.
 */
function tryExtractCallExpression(
  node: Node,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ExtractedCall | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }

  const callExpr = node as CallExpression;
  const expr = callExpr.getExpression();
  const args = callExpr.getArguments().map((a) => a.getText());

  // Property access call: obj.method(args)
  if (Node.isPropertyAccessExpression(expr)) {
    const objText = expr.getExpression().getText();
    const methodName = expr.getName();
    const target = `${objText}.${methodName}`;

    // Detect state access patterns
    detectStateAccess(objText, methodName, stateReads, stateWrites);

    return { target, args };
  }

  // Direct call: fn(args)
  if (Node.isIdentifier(expr)) {
    return { target: expr.getText(), args };
  }

  // Fallback: use the expression text as target
  return { target: expr.getText(), args };
}

// ---- Emit detection -------------------------------------------------------

/**
 * Try to extract an EMIT node from a call expression.
 *
 * Detects patterns:
 * - obj.emit("EventName", payload)
 * - eventEmitter.emit("EventName", data)
 * - dispatch("EventName", payload)
 * - obj.fire("EventName", payload)
 */
function tryExtractEmit(node: Node): StatementNode | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }

  const callExpr = node as CallExpression;
  const expr = callExpr.getExpression();

  let methodName: string | undefined;

  if (Node.isPropertyAccessExpression(expr)) {
    methodName = expr.getName();
  } else if (Node.isIdentifier(expr)) {
    methodName = expr.getText();
  }

  if (!methodName) {
    return undefined;
  }

  const emitMethods = ["emit", "dispatch", "fire", "dispatchEvent"];
  if (!emitMethods.includes(methodName)) {
    return undefined;
  }

  const args = callExpr.getArguments();
  if (args.length === 0) {
    return undefined;
  }

  const eventName = args[0].getText().replace(/^["']|["']$/g, "");
  const payload = args.length > 1 ? args[1].getText() : undefined;

  return emit({ event: eventName, payload });
}

// ---- State access detection -----------------------------------------------

/** Database/store method patterns that indicate read access. */
const READ_METHODS = new Set([
  "find",
  "findOne",
  "findById",
  "findAll",
  "get",
  "getAll",
  "query",
  "select",
  "fetch",
  "read",
  "list",
  "count",
  "exists",
  "search",
]);

/** Database/store method patterns that indicate write access. */
const WRITE_METHODS = new Set([
  "save",
  "create",
  "insert",
  "update",
  "delete",
  "remove",
  "upsert",
  "put",
  "set",
  "write",
  "add",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "destroy",
]);

/**
 * Detect if a method call represents a database/store access pattern and
 * record it as a state read or write.
 */
function detectStateAccess(
  objText: string,
  methodName: string,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  if (READ_METHODS.has(methodName)) {
    if (!stateReads.has(objText)) {
      stateReads.set(objText, namedType(objText));
    }
  }
  if (WRITE_METHODS.has(methodName)) {
    if (!stateWrites.has(objText)) {
      stateWrites.set(objText, namedType(objText));
    }
  }
}

// ---- Dependency collection ------------------------------------------------

/**
 * Collect dependency names from an import declaration.
 *
 * External packages (non-relative imports) are recorded as dependencies.
 * Relative imports (starting with . or /) are ignored.
 */
function collectDependencies(
  imp: ImportDeclaration,
  depNames: Set<string>,
): void {
  const moduleSpecifier = imp.getModuleSpecifierValue();

  // Skip relative imports
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return;
  }

  // Extract the package name (handle scoped packages like @scope/name)
  const parts = moduleSpecifier.split("/");
  const packageName =
    moduleSpecifier.startsWith("@") && parts.length >= 2
      ? `${parts[0]}/${parts[1]}`
      : parts[0];

  depNames.add(packageName);
}

// ---- Builder helpers for top-level blocks ---------------------------------

/** Build a DEPENDS node from collected dependency names. */
function buildDependsNode(depNames: Set<string>): DependsNode | undefined {
  if (depNames.size === 0) {
    return undefined;
  }

  const sortedNames = [...depNames].sort();
  const deps = sortedNames.map((name) => dependencyDef({ name }));
  return depends({ dependencies: deps });
}

/** Build a STATE node from collected state reads and writes. */
function buildStateNode(
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): StateNode | undefined {
  const fields = [];

  // Sorted for determinism
  const readKeys = [...stateReads.keys()].sort();
  for (const key of readKeys) {
    const fieldType = stateReads.get(key);
    if (fieldType) {
      fields.push(stateField({ access: "READS", name: key, fieldType }));
    }
  }

  const writeKeys = [...stateWrites.keys()].sort();
  for (const key of writeKeys) {
    const fieldType = stateWrites.get(key);
    if (fieldType) {
      fields.push(stateField({ access: "WRITES", name: key, fieldType }));
    }
  }

  if (fields.length === 0) {
    return undefined;
  }

  return state({ fields });
}

// ---- Expression sanitization for CodeSpec output --------------------------

/**
 * Convert a raw TypeScript expression string into a CodeSpec-safe expression.
 *
 * Handles:
 *  - Template literals: `Hello, ${name}!` -> "Hello, " + name + "!"
 *  - Object literals: { a: 1, b: 2 } -> wrapped in parens to avoid brace issues
 *  - Passes through everything else unchanged.
 */
function toCodeSpecExpr(text: string): string {
  const trimmed = text.trim();

  // Handle template literals: `...${expr}...`
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return convertTemplateLiteral(trimmed);
  }

  // Handle object literals that start with { — wrap the value description
  if (trimmed.startsWith("{")) {
    return convertObjectLiteral(trimmed);
  }

  return trimmed;
}

/** Convert a JS template literal to string concatenation. */
function convertTemplateLiteral(template: string): string {
  // Remove surrounding backticks
  const inner = template.slice(1, -1);
  const parts: string[] = [];
  let current = "";
  let i = 0;

  while (i < inner.length) {
    if (inner[i] === "$" && inner[i + 1] === "{") {
      // Push accumulated text as a string literal
      if (current) {
        parts.push(`"${current}"`);
        current = "";
      }
      // Find matching closing brace
      let depth = 1;
      let j = i + 2;
      while (j < inner.length && depth > 0) {
        if (inner[j] === "{") depth++;
        if (inner[j] === "}") depth--;
        j++;
      }
      const expr = inner.slice(i + 2, j - 1);
      parts.push(expr);
      i = j;
    } else {
      current += inner[i];
      i++;
    }
  }

  if (current) {
    parts.push(`"${current}"`);
  }

  return parts.length > 0 ? parts.join(" + ") : '""';
}

/** Convert an object literal to a descriptive SET value. */
function convertObjectLiteral(obj: string): string {
  // Extract key names from simple object literals like { a: x, b: y }
  const inner = obj.slice(1, -1).trim();
  const keyPattern = /(\w+)\s*:/g;
  const keys: string[] = [];
  let kMatch: RegExpMatchArray | null;
  while ((kMatch = keyPattern.exec(inner)) !== null) {
    keys.push(kMatch[1]);
  }
  if (keys.length > 0) {
    return `new { ${keys.join(", ")} }`;
  }
  return `new {}`;
}
