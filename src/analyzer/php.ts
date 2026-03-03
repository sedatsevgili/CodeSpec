// ---------------------------------------------------------------------------
// PHP Analyzer
//
// Reads PHP source code and produces a CodeSpec AST using pure static
// analysis via php-parser (Glayzzle). Fully deterministic: same input code
// always produces the same AST output. No AI, no API calls, no randomness.
// ---------------------------------------------------------------------------

import PhpParser from "php-parser";

import type {
  ModuleNode,
  ModuleMember,
  TypeReference,
  StatementNode,
  ActionNode,
  DependsNode,
  StateNode,
} from "../ast/nodes.js";

import {
  primitiveType,
  listType,
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
  depends,
  dependencyDef,
  state,
  stateField,
  module as moduleNode,
} from "../ast/builder.js";

import * as fs from "fs";

// ---- PHP-parser node type interfaces --------------------------------------
//
// php-parser uses a `kind` discriminant on all nodes. We define minimal
// interfaces for the node shapes we consume, keeping them narrow to avoid
// reliance on `any`.
// ---------------------------------------------------------------------------

interface PhpNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

interface PhpProgram extends PhpNode {
  readonly kind: "program";
  readonly children: readonly PhpNode[];
}

interface PhpNamespace extends PhpNode {
  readonly kind: "namespace";
  readonly children: readonly PhpNode[];
  readonly name: string;
}

interface PhpClass extends PhpNode {
  readonly kind: "class";
  readonly name: PhpIdentifier | string;
  readonly body: readonly PhpNode[];
  readonly extends: PhpIdentifier | null;
  readonly implements: readonly PhpIdentifier[] | null;
}

interface PhpMethod extends PhpNode {
  readonly kind: "method";
  readonly name: PhpIdentifier | string;
  readonly arguments: readonly PhpParameter[];
  readonly type: PhpIdentifier | null;
  readonly nullable: boolean;
  readonly body: PhpBlock | null;
}

interface PhpFunction extends PhpNode {
  readonly kind: "function";
  readonly name: PhpIdentifier | string;
  readonly arguments: readonly PhpParameter[];
  readonly type: PhpIdentifier | null;
  readonly nullable: boolean;
  readonly body: PhpBlock | null;
}

interface PhpParameter extends PhpNode {
  readonly kind: "parameter";
  readonly name: PhpIdentifier | string;
  readonly type: PhpIdentifier | PhpUnionType | PhpIntersectionType | null;
  readonly nullable: boolean;
  readonly value: PhpNode | null;
}

interface PhpIdentifier extends PhpNode {
  readonly kind: "identifier" | "name" | "typereference";
  readonly name: string;
}

interface PhpUnionType extends PhpNode {
  readonly kind: "uniontype";
  readonly types: readonly PhpIdentifier[];
}

interface PhpIntersectionType extends PhpNode {
  readonly kind: "intersectiontype";
  readonly types: readonly PhpIdentifier[];
}

interface PhpBlock extends PhpNode {
  readonly kind: "block";
  readonly children: readonly PhpNode[];
}

interface PhpIf extends PhpNode {
  readonly kind: "if";
  readonly test: PhpNode;
  readonly body: PhpBlock;
  readonly alternate: PhpBlock | PhpIf | null;
}

interface PhpSwitch extends PhpNode {
  readonly kind: "switch";
  readonly test: PhpNode;
  readonly body: PhpBlock;
}

interface PhpCase extends PhpNode {
  readonly kind: "case";
  readonly test: PhpNode | null;
  readonly body: PhpBlock | null;
}

interface PhpReturn extends PhpNode {
  readonly kind: "return";
  readonly expr: PhpNode | null;
}

interface PhpThrow extends PhpNode {
  readonly kind: "throw";
  readonly what: PhpNode;
}

interface PhpNew extends PhpNode {
  readonly kind: "new";
  readonly what: PhpIdentifier | PhpNode;
  readonly arguments: readonly PhpNode[];
}

interface PhpCall extends PhpNode {
  readonly kind: "call";
  readonly what: PhpNode;
  readonly arguments: readonly PhpNode[];
}

interface PhpPropertyLookup extends PhpNode {
  readonly kind: "propertylookup";
  readonly what: PhpNode;
  readonly offset: PhpIdentifier | PhpNode;
}

interface PhpStaticLookup extends PhpNode {
  readonly kind: "staticlookup";
  readonly what: PhpNode;
  readonly offset: PhpIdentifier | PhpNode;
}

interface PhpExpressionStatement extends PhpNode {
  readonly kind: "expressionstatement";
  readonly expression: PhpNode;
}

interface PhpAssign extends PhpNode {
  readonly kind: "assign";
  readonly left: PhpNode;
  readonly right: PhpNode;
  readonly operator: string;
}

interface PhpVariable extends PhpNode {
  readonly kind: "variable";
  readonly name: string | PhpNode;
}

interface PhpPropertyStatement extends PhpNode {
  readonly kind: "propertystatement";
  readonly properties: readonly PhpProperty[];
  readonly visibility: string | null;
}

interface PhpProperty extends PhpNode {
  readonly kind: "property";
  readonly name: PhpIdentifier | string;
  readonly type: PhpIdentifier | PhpUnionType | PhpIntersectionType | null;
  readonly nullable: boolean;
  readonly value: PhpNode | null;
}

interface PhpUseGroup extends PhpNode {
  readonly kind: "usegroup";
  readonly name: string | null;
  readonly items: readonly PhpUseItem[];
}

interface PhpUseItem extends PhpNode {
  readonly kind: "useitem";
  readonly name: string;
}

interface PhpTry extends PhpNode {
  readonly kind: "try";
  readonly body: PhpBlock;
  readonly catches: readonly PhpCatch[];
}

interface PhpCatch extends PhpNode {
  readonly kind: "catch";
  readonly what: readonly PhpIdentifier[];
  readonly variable: PhpVariable;
  readonly body: PhpBlock;
}

interface PhpString extends PhpNode {
  readonly kind: "string";
  readonly value: string;
}

interface PhpNumber extends PhpNode {
  readonly kind: "number";
  readonly value: number;
}

// ---- Public API -----------------------------------------------------------

/**
 * Analyze a PHP file on disk and produce a CodeSpec ModuleNode.
 *
 * The module name is derived from the file name (without extension),
 * converted to PascalCase.
 */
export function analyzePhp(filePath: string): ModuleNode {
  const source = fs.readFileSync(filePath, "utf-8");
  const baseName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "module.php";
  return analyzePhpSource(source, baseName);
}

/**
 * Analyze PHP source code provided as a string and produce a CodeSpec
 * ModuleNode.
 *
 * This is useful for testing without writing files to disk.
 *
 * @param source   - The PHP source code to analyze (must include `<?php` tag).
 * @param fileName - An optional virtual file name (defaults to "module.php").
 */
export function analyzePhpSource(
  source: string,
  fileName?: string,
): ModuleNode {
  const name = fileName ?? "module.php";
  const moduleName = deriveModuleName(name);

  const parser = new PhpParser.Engine({
    parser: { extractDoc: false, suppressErrors: true },
    ast: { withPositions: false, withSource: false },
  });

  const ast = parser.parseCode(source, name) as unknown as PhpProgram;

  return analyzeProgram(ast, moduleName);
}

// ---- Core analysis --------------------------------------------------------

/**
 * Analyze a php-parser Program AST and produce a CodeSpec ModuleNode.
 *
 * Extraction order is deterministic: use statements (DEPENDS), classes
 * (properties, methods -> ACTIONs), top-level functions (ACTIONs), then
 * STATE from detected patterns.
 */
function analyzeProgram(program: PhpProgram, moduleName: string): ModuleNode {
  const members: ModuleMember[] = [];
  const dependencyNames = new Set<string>();
  const stateReads = new Map<string, TypeReference>();
  const stateWrites = new Map<string, TypeReference>();

  // Collect all nodes, flattening namespaces
  const topNodes = flattenNamespaces(program.children);

  // 1. Extract dependencies from `use` statements
  for (const node of topNodes) {
    if (node.kind === "usegroup") {
      collectUseDependencies(node as PhpUseGroup, dependencyNames);
    }
  }

  // 2. Extract classes (properties -> fields, methods -> ACTIONs)
  for (const node of topNodes) {
    if (node.kind === "class") {
      analyzeClassNode(
        node as PhpClass,
        members,
        dependencyNames,
        stateReads,
        stateWrites,
      );
    }
  }

  // 3. Extract top-level functions as ACTIONs
  for (const node of topNodes) {
    if (node.kind === "function") {
      const actionNode = analyzeFunctionNode(
        node as PhpFunction,
        dependencyNames,
        stateReads,
        stateWrites,
      );
      members.push(actionNode);
    }
  }

  // 4. Build STATE block from detected reads/writes
  const stateNode = buildStateNode(stateReads, stateWrites);
  if (stateNode) {
    members.unshift(stateNode);
  }

  // 5. Build DEPENDS block from collected dependencies
  const dependsNode = buildDependsNode(dependencyNames);
  if (dependsNode) {
    members.push(dependsNode);
  }

  return moduleNode({ name: moduleName, members });
}

// ---- Namespace flattening -------------------------------------------------

/**
 * Flatten namespace blocks to get all top-level declarations.
 * PHP files may wrap everything in a namespace block.
 */
function flattenNamespaces(nodes: readonly PhpNode[]): readonly PhpNode[] {
  const result: PhpNode[] = [];
  for (const node of nodes) {
    if (node.kind === "namespace") {
      const ns = node as PhpNamespace;
      result.push(...ns.children);
    } else {
      result.push(node);
    }
  }
  return result;
}

// ---- Module name derivation -----------------------------------------------

/**
 * Derive a PascalCase module name from a file name.
 *
 * "user-service.php" -> "UserService"
 * "UserController.php" -> "UserController"
 */
function deriveModuleName(fileName: string): string {
  const base = fileName.replace(/\.php$/, "");
  const words = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_.\s]+/)
    .filter((w) => w.length > 0);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

// ---- Type mapping ---------------------------------------------------------

/**
 * Map a PHP type identifier to a CodeSpec TypeReference.
 *
 * Handles primitives (string, int, float, bool, void), DateTime, array,
 * nullable types, union types, and falls back to NamedType for everything
 * else.
 */
function mapPhpType(
  typeNode: PhpIdentifier | PhpUnionType | PhpIntersectionType | null,
  nullable: boolean,
): TypeReference {
  if (!typeNode) {
    return primitiveType("Void");
  }

  // Union type: check for nullable pattern (Type|null)
  if (typeNode.kind === "uniontype") {
    const unionNode = typeNode as PhpUnionType;
    const nonNull = unionNode.types.filter(
      (t) => getIdentifierName(t).toLowerCase() !== "null",
    );
    if (nonNull.length === 1 && nonNull.length < unionNode.types.length) {
      return optionalType(mapPhpTypeName(getIdentifierName(nonNull[0])));
    }
    // For complex unions, use the first non-null type as named
    if (nonNull.length > 0) {
      return namedType(nonNull.map((t) => getIdentifierName(t)).join("|"));
    }
    return primitiveType("Void");
  }

  // Intersection type: combine as named type
  if (typeNode.kind === "intersectiontype") {
    const interNode = typeNode as PhpIntersectionType;
    const name = interNode.types.map((t) => getIdentifierName(t)).join("&");
    return nullable ? optionalType(namedType(name)) : namedType(name);
  }

  const typeName = getIdentifierName(typeNode as PhpIdentifier);
  const result = mapPhpTypeName(typeName);

  if (nullable && result.kind !== "optional") {
    return optionalType(result);
  }

  return result;
}

/** Map a PHP type name string to a CodeSpec TypeReference. */
function mapPhpTypeName(typeName: string): TypeReference {
  switch (typeName.toLowerCase()) {
    case "string":
      return primitiveType("String");
    case "int":
    case "integer":
      return primitiveType("Int");
    case "float":
    case "double":
      return primitiveType("Float");
    case "bool":
    case "boolean":
      return primitiveType("Bool");
    case "void":
      return primitiveType("Void");
    case "array":
      return listType(primitiveType("String"));
    case "datetime":
    case "\\datetime":
    case "datetimeinterface":
    case "\\datetimeinterface":
    case "datetimeimmutable":
    case "\\datetimeimmutable":
    case "carbon":
    case "\\carbon\\carbon":
      return primitiveType("DateTime");
    case "mixed":
      return namedType("mixed");
    case "null":
      return primitiveType("Void");
    case "self":
    case "static":
      return namedType(typeName);
    default:
      return namedType(typeName);
  }
}

/** Extract the name string from a PHP identifier node. */
function getIdentifierName(node: PhpIdentifier | PhpNode): string {
  if (typeof (node as PhpIdentifier).name === "string") {
    return (node as PhpIdentifier).name;
  }
  return String(node);
}

// ---- Class analysis -------------------------------------------------------

/**
 * Analyze a PHP class declaration.
 *
 * Extracts property statements as INPUT/OUTPUT fields and methods as
 * ACTION nodes.
 */
function analyzeClassNode(
  cls: PhpClass,
  members: ModuleMember[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  // Collect class properties for INPUT/OUTPUT
  const fields = [];
  for (const member of cls.body) {
    if (member.kind === "propertystatement") {
      const propStmt = member as PhpPropertyStatement;
      for (const prop of propStmt.properties) {
        const propName = getNodeName(prop.name);
        const propType = mapPhpType(
          prop.type as PhpIdentifier | PhpUnionType | PhpIntersectionType | null,
          prop.nullable,
        );
        fields.push(field({ name: propName, fieldType: propType }));
      }
    }
  }

  // If we have class properties, add them as OUTPUT (default classification)
  if (fields.length > 0) {
    const className = getNodeName(cls.name);
    const classification = classifyName(className);
    if (classification === "input") {
      members.push(input({ fields }));
    } else {
      members.push(output({ fields }));
    }
  }

  // Extract methods as ACTIONs
  for (const member of cls.body) {
    if (member.kind === "method") {
      const methodNode = analyzeMethodNode(
        member as PhpMethod,
        depNames,
        stateReads,
        stateWrites,
      );
      members.push(methodNode);
    }
  }
}

/**
 * Classify a name as "input" or "output" based on naming patterns.
 */
function classifyName(name: string): "input" | "output" {
  const lower = name.toLowerCase();
  if (lower.includes("input") || lower.includes("request")) {
    return "input";
  }
  return "output";
}

/** Extract a name string from a node that may be a string or identifier. */
function getNodeName(nameNode: PhpIdentifier | string | PhpNode): string {
  if (typeof nameNode === "string") {
    return nameNode;
  }
  if (typeof (nameNode as PhpIdentifier).name === "string") {
    return (nameNode as PhpIdentifier).name;
  }
  return "Unknown";
}

// ---- Function / method analysis -------------------------------------------

/**
 * Analyze a PHP top-level function and produce an ActionNode.
 */
function analyzeFunctionNode(
  fn: PhpFunction,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ActionNode {
  const name = getNodeName(fn.name);
  const params = fn.arguments.map(analyzeParameterNode);
  const returnType = mapPhpType(fn.type, fn.nullable);
  const body = fn.body;
  const statements: StatementNode[] = [];

  if (body && body.kind === "block") {
    analyzeBlockNode(body, statements, depNames, stateReads, stateWrites);
  }

  return action({ name, params, returnType, body: statements });
}

/**
 * Analyze a PHP class method and produce an ActionNode.
 */
function analyzeMethodNode(
  method: PhpMethod,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ActionNode {
  const name = getNodeName(method.name);
  const params = method.arguments.map(analyzeParameterNode);
  const returnType = mapPhpType(method.type, method.nullable);
  const body = method.body;
  const statements: StatementNode[] = [];

  if (body && body.kind === "block") {
    analyzeBlockNode(body, statements, depNames, stateReads, stateWrites);
  }

  return action({ name, params, returnType, body: statements });
}

/** Analyze a PHP function parameter into a ParameterNode. */
function analyzeParameterNode(param: PhpParameter) {
  const name = getNodeName(param.name);
  const paramType = mapPhpType(
    param.type as PhpIdentifier | PhpUnionType | PhpIntersectionType | null,
    param.nullable,
  );

  return parameter({ name, paramType });
}

// ---- Block analysis -------------------------------------------------------

/**
 * Analyze a block of PHP statements and produce CodeSpec StatementNodes.
 */
function analyzeBlockNode(
  block: PhpBlock,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  for (const stmt of block.children) {
    analyzePhpStatement(stmt, out, depNames, stateReads, stateWrites);
  }
}

/**
 * Analyze a single PHP statement and append CodeSpec nodes to `out`.
 */
function analyzePhpStatement(
  stmt: PhpNode,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  // if / elseif / else -> WHEN / OTHERWISE
  if (stmt.kind === "if") {
    out.push(analyzeIfNode(stmt as PhpIf, depNames, stateReads, stateWrites));
    return;
  }

  // switch -> MATCH
  if (stmt.kind === "switch") {
    out.push(analyzeSwitchNode(stmt as PhpSwitch, depNames, stateReads, stateWrites));
    return;
  }

  // throw -> FAIL
  if (stmt.kind === "throw") {
    out.push(analyzeThrowNode(stmt as PhpThrow));
    return;
  }

  // return -> RETURN
  if (stmt.kind === "return") {
    out.push(analyzeReturnNode(stmt as PhpReturn));
    return;
  }

  // expression statement (assignment, function call, method call, etc.)
  if (stmt.kind === "expressionstatement") {
    analyzeExprStatement(
      stmt as PhpExpressionStatement,
      out,
      depNames,
      stateReads,
      stateWrites,
    );
    return;
  }

  // try/catch
  if (stmt.kind === "try") {
    analyzeTryNode(stmt as PhpTry, out, depNames, stateReads, stateWrites);
    return;
  }
}

// ---- if/elseif/else -> WHEN/OTHERWISE ------------------------------------

/** Analyze a PHP if statement into a WhenNode with optional OTHERWISE. */
function analyzeIfNode(
  stmt: PhpIf,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): StatementNode {
  const condition = expressionToString(stmt.test);
  const body: StatementNode[] = [];

  if (stmt.body && stmt.body.kind === "block") {
    analyzeBlockNode(stmt.body, body, depNames, stateReads, stateWrites);
  }

  let otherwise: StatementNode[] | undefined;
  if (stmt.alternate) {
    otherwise = [];
    if (stmt.alternate.kind === "if") {
      // elseif: recursively create a nested WHEN
      otherwise.push(
        analyzeIfNode(stmt.alternate as PhpIf, depNames, stateReads, stateWrites),
      );
    } else if (stmt.alternate.kind === "block") {
      analyzeBlockNode(
        stmt.alternate as PhpBlock,
        otherwise,
        depNames,
        stateReads,
        stateWrites,
      );
    }
  }

  return when({ condition, body, otherwise });
}

// ---- switch -> MATCH ------------------------------------------------------

/** Analyze a PHP switch statement into a MatchNode. */
function analyzeSwitchNode(
  stmt: PhpSwitch,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): StatementNode {
  const subject = expressionToString(stmt.test);
  const arms = [];

  if (stmt.body && stmt.body.kind === "block") {
    for (const child of stmt.body.children) {
      if (child.kind === "case") {
        const caseNode = child as PhpCase;
        const pattern = caseNode.test
          ? expressionToString(caseNode.test).replace(/^["']|["']$/g, "")
          : "_";
        const caseBody: StatementNode[] = [];
        if (caseNode.body && caseNode.body.kind === "block") {
          analyzeBlockNode(caseNode.body, caseBody, depNames, stateReads, stateWrites);
        }
        arms.push(matchArm({ pattern, body: caseBody }));
      }
    }
  }

  return match({ subject, arms });
}

// ---- throw -> FAIL --------------------------------------------------------

/** Analyze a PHP throw statement into a FailNode. */
function analyzeThrowNode(stmt: PhpThrow): StatementNode {
  const what = stmt.what;

  // throw new ExceptionType("message")
  if (what.kind === "new") {
    const newExpr = what as PhpNew;
    const errorName = getNodeName(newExpr.what as PhpIdentifier);
    const args = newExpr.arguments;
    let message: string | undefined;
    if (args.length > 0) {
      message = extractStringValue(args[0]);
    }
    return fail({ error: errorName, message });
  }

  // throw $variable or throw expression
  return fail({ error: expressionToString(what) });
}

// ---- return -> RETURN -----------------------------------------------------

/** Analyze a PHP return statement into a ReturnNode. */
function analyzeReturnNode(stmt: PhpReturn): StatementNode {
  const expr = stmt.expr;
  const value = expr ? expressionToString(expr) : "void";
  return returnNode({ value });
}

// ---- Expression statement analysis ----------------------------------------

/**
 * Analyze a PHP expression statement. Handles:
 * - Assignments -> SET
 * - Function/method calls -> CALL
 * - State access patterns
 */
function analyzeExprStatement(
  stmt: PhpExpressionStatement,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  const expr = stmt.expression;

  // Assignment: $x = value
  if (expr.kind === "assign") {
    const assignExpr = expr as PhpAssign;
    const varName = expressionToString(assignExpr.left);
    const right = assignExpr.right;

    // Check if RHS is a function/method call
    const callResult = tryExtractPhpCall(right, depNames, stateReads, stateWrites);
    if (callResult) {
      out.push(
        call({
          target: callResult.target,
          args: callResult.args,
          assignTo: varName,
        }),
      );
      return;
    }

    out.push(set({ variable: varName, value: expressionToString(right) }));
    return;
  }

  // Function/method call
  const callResult = tryExtractPhpCall(expr, depNames, stateReads, stateWrites);
  if (callResult) {
    out.push(call({ target: callResult.target, args: callResult.args }));
    return;
  }
}

// ---- try/catch analysis ---------------------------------------------------

/** Analyze a PHP try/catch statement. */
function analyzeTryNode(
  stmt: PhpTry,
  out: StatementNode[],
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): void {
  // Analyze the try block body
  if (stmt.body && stmt.body.kind === "block") {
    analyzeBlockNode(stmt.body, out, depNames, stateReads, stateWrites);
  }

  // Analyze catch clauses
  for (const catchClause of stmt.catches) {
    const catchBody: StatementNode[] = [];
    if (catchClause.body && catchClause.body.kind === "block") {
      analyzeBlockNode(catchClause.body, catchBody, depNames, stateReads, stateWrites);
    }
    if (catchBody.length > 0) {
      const catchTypes = catchClause.what
        .map((w) => getIdentifierName(w))
        .join(" | ");
      const varName = typeof catchClause.variable.name === "string"
        ? catchClause.variable.name
        : "e";
      const condition = `error is ${catchTypes} (${varName})`;
      out.push(when({ condition, body: catchBody }));
    }
  }
}

// ---- Call expression extraction -------------------------------------------

interface ExtractedCall {
  readonly target: string;
  readonly args: readonly string[];
}

/** Database/store method patterns that indicate read access. */
const READ_METHODS = new Set([
  "find", "findOne", "findById", "findAll", "get", "getAll", "query",
  "select", "fetch", "read", "list", "count", "exists", "search",
  "findBy", "findOneBy", "getRepository",
]);

/** Database/store method patterns that indicate write access. */
const WRITE_METHODS = new Set([
  "save", "create", "insert", "update", "delete", "remove", "upsert",
  "put", "set", "write", "add", "push", "persist", "flush", "destroy",
]);

/**
 * Try to extract a call expression from a PHP node. Handles:
 * - Direct calls: fn(args)
 * - Method calls: $obj->method(args)
 * - Static calls: Class::method(args)
 */
function tryExtractPhpCall(
  node: PhpNode,
  depNames: Set<string>,
  stateReads: Map<string, TypeReference>,
  stateWrites: Map<string, TypeReference>,
): ExtractedCall | undefined {
  if (node.kind !== "call") {
    return undefined;
  }

  const callNode = node as PhpCall;
  const what = callNode.what;
  const args = callNode.arguments.map((a) => expressionToString(a));

  // Property lookup: $obj->method(args)
  if (what.kind === "propertylookup") {
    const lookup = what as PhpPropertyLookup;
    const objText = expressionToString(lookup.what);
    const methodName = getNodeName(lookup.offset as PhpIdentifier);
    const target = `${objText}.${methodName}`;

    // Detect state access patterns
    detectStateAccess(objText, methodName, stateReads, stateWrites);

    return { target, args };
  }

  // Static lookup: Class::method(args)
  if (what.kind === "staticlookup") {
    const lookup = what as PhpStaticLookup;
    const className = getNodeName(lookup.what as PhpIdentifier);
    const methodName = getNodeName(lookup.offset as PhpIdentifier);
    const target = `${className}.${methodName}`;

    return { target, args };
  }

  // Direct call: fn(args)
  if (what.kind === "identifier" || what.kind === "name") {
    const target = getIdentifierName(what as PhpIdentifier);
    return { target, args };
  }

  // Variable as function: $callback(args)
  if (what.kind === "variable") {
    const target = expressionToString(what);
    return { target, args };
  }

  return undefined;
}

// ---- State access detection -----------------------------------------------

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
 * Collect dependency names from a PHP `use` statement.
 *
 * PHP `use` statements import classes from namespaces. We extract the
 * top-level namespace as a dependency.
 */
function collectUseDependencies(
  useGroup: PhpUseGroup,
  depNames: Set<string>,
): void {
  for (const item of useGroup.items) {
    const fullName = item.name;
    // Extract the top-level namespace as the dependency name
    const parts = fullName.split("\\");
    if (parts.length > 0 && parts[0].length > 0) {
      depNames.add(parts[0]);
    }
  }
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

// ---- Expression to string -------------------------------------------------

/**
 * Convert a PHP AST expression node to its string representation.
 *
 * This produces a deterministic string for conditions, return values,
 * and other expressions embedded in CodeSpec nodes.
 */
function expressionToString(node: PhpNode): string {
  switch (node.kind) {
    case "variable": {
      const varNode = node as PhpVariable;
      const name = typeof varNode.name === "string" ? varNode.name : expressionToString(varNode.name as PhpNode);
      return `$${name}`;
    }
    case "string": {
      const strNode = node as PhpString;
      return `"${strNode.value}"`;
    }
    case "number": {
      const numNode = node as PhpNumber;
      return String(numNode.value);
    }
    case "boolean":
      return (node as unknown as { value: boolean }).value ? "true" : "false";
    case "identifier":
    case "name":
    case "typereference":
      return getIdentifierName(node as PhpIdentifier);
    case "propertylookup": {
      const lookup = node as PhpPropertyLookup;
      return `${expressionToString(lookup.what)}->${getNodeName(lookup.offset as PhpIdentifier)}`;
    }
    case "staticlookup": {
      const lookup = node as PhpStaticLookup;
      return `${getNodeName(lookup.what as PhpIdentifier)}::${getNodeName(lookup.offset as PhpIdentifier)}`;
    }
    case "call": {
      const callNode = node as PhpCall;
      const target = expressionToString(callNode.what);
      const args = callNode.arguments.map((a) => expressionToString(a)).join(", ");
      return `${target}(${args})`;
    }
    case "new": {
      const newNode = node as PhpNew;
      const className = getNodeName(newNode.what as PhpIdentifier);
      const args = newNode.arguments.map((a) => expressionToString(a)).join(", ");
      return `new ${className}(${args})`;
    }
    case "bin": {
      const binNode = node as unknown as { type: string; left: PhpNode; right: PhpNode };
      const left = expressionToString(binNode.left);
      const right = expressionToString(binNode.right);
      return `${left} ${binNode.type} ${right}`;
    }
    case "unary": {
      const unaryNode = node as unknown as { type: string; what: PhpNode };
      return `${unaryNode.type}${expressionToString(unaryNode.what)}`;
    }
    case "cast": {
      const castNode = node as unknown as { type: string; raw: string; expr: PhpNode };
      return `(${castNode.raw})${expressionToString(castNode.expr)}`;
    }
    case "array":
      return "[]";
    case "nullkeyword":
      return "null";
    case "assign": {
      const assignNode = node as PhpAssign;
      return `${expressionToString(assignNode.left)} = ${expressionToString(assignNode.right)}`;
    }
    case "retif": {
      const retifNode = node as unknown as { test: PhpNode; trueExpr: PhpNode; falseExpr: PhpNode };
      return `${expressionToString(retifNode.test)} ? ${expressionToString(retifNode.trueExpr)} : ${expressionToString(retifNode.falseExpr)}`;
    }
    default:
      return `<${node.kind}>`;
  }
}

/**
 * Extract a plain string value from a PHP AST node if it is a string literal.
 */
function extractStringValue(node: PhpNode): string | undefined {
  if (node.kind === "string") {
    return (node as PhpString).value;
  }
  return undefined;
}
