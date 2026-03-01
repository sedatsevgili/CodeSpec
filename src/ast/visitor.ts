// ---------------------------------------------------------------------------
// CodeSpec AST Visitor / Walker
//
// Provides a visitor interface and walk functions for traversing the AST.
// Supports both pre-order (enter) and post-order (leave) traversal via
// optional callbacks on the AstVisitor interface.
// ---------------------------------------------------------------------------

import type {
  SpecFile,
  ModuleNode,
  ModuleMember,
  InputNode,
  OutputNode,
  StateNode,
  ActionNode,
  InvariantsNode,
  ErrorsNode,
  DependsNode,
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
  StateFieldNode,
  InvariantRule,
  ErrorDef,
  DependencyDef,
} from "./nodes.js";

// ---- Visitor interface -----------------------------------------------------

/**
 * Visitor interface with optional enter/leave callbacks for each AST node type.
 *
 * Implement only the methods you care about. All methods are optional.
 * `enter*` methods are called before visiting children (pre-order).
 * `leave*` methods are called after visiting children (post-order).
 */
export interface AstVisitor {
  // SpecFile
  enterSpecFile?(node: SpecFile): void;
  leaveSpecFile?(node: SpecFile): void;

  // Module
  enterModule?(node: ModuleNode): void;
  leaveModule?(node: ModuleNode): void;

  // Top-level blocks
  enterInput?(node: InputNode): void;
  leaveInput?(node: InputNode): void;
  enterOutput?(node: OutputNode): void;
  leaveOutput?(node: OutputNode): void;
  enterState?(node: StateNode): void;
  leaveState?(node: StateNode): void;
  enterAction?(node: ActionNode): void;
  leaveAction?(node: ActionNode): void;
  enterInvariants?(node: InvariantsNode): void;
  leaveInvariants?(node: InvariantsNode): void;
  enterErrors?(node: ErrorsNode): void;
  leaveErrors?(node: ErrorsNode): void;
  enterDepends?(node: DependsNode): void;
  leaveDepends?(node: DependsNode): void;

  // Fields, parameters, and leaf sub-nodes
  enterField?(node: FieldNode): void;
  leaveField?(node: FieldNode): void;
  enterParameter?(node: ParameterNode): void;
  leaveParameter?(node: ParameterNode): void;
  enterStateField?(node: StateFieldNode): void;
  leaveStateField?(node: StateFieldNode): void;
  enterInvariantRule?(node: InvariantRule): void;
  leaveInvariantRule?(node: InvariantRule): void;
  enterErrorDef?(node: ErrorDef): void;
  leaveErrorDef?(node: ErrorDef): void;
  enterDependencyDef?(node: DependencyDef): void;
  leaveDependencyDef?(node: DependencyDef): void;

  // Statements
  enterWhen?(node: WhenNode): void;
  leaveWhen?(node: WhenNode): void;
  enterMatch?(node: MatchNode): void;
  leaveMatch?(node: MatchNode): void;
  enterMatchArm?(node: MatchArm): void;
  leaveMatchArm?(node: MatchArm): void;
  enterSet?(node: SetNode): void;
  leaveSet?(node: SetNode): void;
  enterCall?(node: CallNode): void;
  leaveCall?(node: CallNode): void;
  enterReturn?(node: ReturnNode): void;
  leaveReturn?(node: ReturnNode): void;
  enterFail?(node: FailNode): void;
  leaveFail?(node: FailNode): void;
  enterEmit?(node: EmitNode): void;
  leaveEmit?(node: EmitNode): void;
  enterRetry?(node: RetryNode): void;
  leaveRetry?(node: RetryNode): void;
  enterLimit?(node: LimitNode): void;
  leaveLimit?(node: LimitNode): void;
  enterComment?(node: CommentNode): void;
  leaveComment?(node: CommentNode): void;
}

// ---- Walk functions --------------------------------------------------------

/** Walk a complete SpecFile, visiting all modules and top-level comments. */
export function walkSpecFile(node: SpecFile, visitor: AstVisitor): void {
  visitor.enterSpecFile?.(node);

  for (const comment of node.comments) {
    walkComment(comment, visitor);
  }

  for (const mod of node.modules) {
    walkModule(mod, visitor);
  }

  visitor.leaveSpecFile?.(node);
}

/** Walk a MODULE node and all of its members in declaration order. */
export function walkModule(node: ModuleNode, visitor: AstVisitor): void {
  visitor.enterModule?.(node);

  for (const member of node.members) {
    walkModuleMember(member, visitor);
  }

  visitor.leaveModule?.(node);
}

/** Walk a single module member, dispatching to the appropriate walk function. */
export function walkModuleMember(
  node: ModuleMember,
  visitor: AstVisitor,
): void {
  switch (node.type) {
    case "Input":
      walkInput(node, visitor);
      break;
    case "Output":
      walkOutput(node, visitor);
      break;
    case "State":
      walkState(node, visitor);
      break;
    case "Action":
      walkAction(node, visitor);
      break;
    case "Invariants":
      walkInvariants(node, visitor);
      break;
    case "Errors":
      walkErrors(node, visitor);
      break;
    case "Depends":
      walkDepends(node, visitor);
      break;
    case "Comment":
      walkComment(node, visitor);
      break;
  }
}

/** Walk an INPUT block and its fields. */
export function walkInput(node: InputNode, visitor: AstVisitor): void {
  visitor.enterInput?.(node);

  for (const f of node.fields) {
    walkField(f, visitor);
  }

  visitor.leaveInput?.(node);
}

/** Walk an OUTPUT block and its fields. */
export function walkOutput(node: OutputNode, visitor: AstVisitor): void {
  visitor.enterOutput?.(node);

  for (const f of node.fields) {
    walkField(f, visitor);
  }

  visitor.leaveOutput?.(node);
}

/** Walk a STATE block and its state field declarations. */
export function walkState(node: StateNode, visitor: AstVisitor): void {
  visitor.enterState?.(node);

  for (const f of node.fields) {
    walkStateField(f, visitor);
  }

  visitor.leaveState?.(node);
}

/** Walk an ACTION node, its parameters, and body statements. */
export function walkAction(node: ActionNode, visitor: AstVisitor): void {
  visitor.enterAction?.(node);

  for (const p of node.params) {
    walkParameter(p, visitor);
  }

  for (const stmt of node.body) {
    walkStatement(stmt, visitor);
  }

  visitor.leaveAction?.(node);
}

/** Walk an INVARIANTS block and its rules. */
export function walkInvariants(
  node: InvariantsNode,
  visitor: AstVisitor,
): void {
  visitor.enterInvariants?.(node);

  for (const rule of node.rules) {
    walkInvariantRule(rule, visitor);
  }

  visitor.leaveInvariants?.(node);
}

/** Walk an ERRORS block and its error definitions. */
export function walkErrors(node: ErrorsNode, visitor: AstVisitor): void {
  visitor.enterErrors?.(node);

  for (const err of node.errors) {
    walkErrorDef(err, visitor);
  }

  visitor.leaveErrors?.(node);
}

/** Walk a DEPENDS block and its dependency definitions. */
export function walkDepends(node: DependsNode, visitor: AstVisitor): void {
  visitor.enterDepends?.(node);

  for (const dep of node.dependencies) {
    walkDependencyDef(dep, visitor);
  }

  visitor.leaveDepends?.(node);
}

/** Walk a comment node. */
export function walkComment(node: CommentNode, visitor: AstVisitor): void {
  visitor.enterComment?.(node);
  visitor.leaveComment?.(node);
}

// ---- Leaf sub-node walkers -------------------------------------------------

/** Walk a field node (leaf). */
export function walkField(node: FieldNode, visitor: AstVisitor): void {
  visitor.enterField?.(node);
  visitor.leaveField?.(node);
}

/** Walk a parameter node (leaf). */
export function walkParameter(node: ParameterNode, visitor: AstVisitor): void {
  visitor.enterParameter?.(node);
  visitor.leaveParameter?.(node);
}

/** Walk a state field node (leaf). */
export function walkStateField(
  node: StateFieldNode,
  visitor: AstVisitor,
): void {
  visitor.enterStateField?.(node);
  visitor.leaveStateField?.(node);
}

/** Walk an invariant rule node (leaf). */
export function walkInvariantRule(
  node: InvariantRule,
  visitor: AstVisitor,
): void {
  visitor.enterInvariantRule?.(node);
  visitor.leaveInvariantRule?.(node);
}

/** Walk an error definition node (leaf). */
export function walkErrorDef(node: ErrorDef, visitor: AstVisitor): void {
  visitor.enterErrorDef?.(node);
  visitor.leaveErrorDef?.(node);
}

/** Walk a dependency definition node (leaf). */
export function walkDependencyDef(
  node: DependencyDef,
  visitor: AstVisitor,
): void {
  visitor.enterDependencyDef?.(node);
  visitor.leaveDependencyDef?.(node);
}

// ---- Statement walkers -----------------------------------------------------

/** Walk any statement node, dispatching to the correct walker. */
export function walkStatement(node: StatementNode, visitor: AstVisitor): void {
  switch (node.type) {
    case "When":
      walkWhen(node, visitor);
      break;
    case "Match":
      walkMatch(node, visitor);
      break;
    case "Set":
      walkSet(node, visitor);
      break;
    case "Call":
      walkCall(node, visitor);
      break;
    case "Return":
      walkReturn(node, visitor);
      break;
    case "Fail":
      walkFail(node, visitor);
      break;
    case "Emit":
      walkEmit(node, visitor);
      break;
    case "Retry":
      walkRetry(node, visitor);
      break;
    case "Limit":
      walkLimit(node, visitor);
      break;
    case "Comment":
      walkComment(node, visitor);
      break;
  }
}

/** Walk a WHEN / OTHERWISE conditional guard and its nested body statements. */
export function walkWhen(node: WhenNode, visitor: AstVisitor): void {
  visitor.enterWhen?.(node);

  for (const stmt of node.body) {
    walkStatement(stmt, visitor);
  }

  if (node.otherwise) {
    for (const stmt of node.otherwise) {
      walkStatement(stmt, visitor);
    }
  }

  visitor.leaveWhen?.(node);
}

/** Walk a MATCH node and all of its arms. */
export function walkMatch(node: MatchNode, visitor: AstVisitor): void {
  visitor.enterMatch?.(node);

  for (const arm of node.arms) {
    walkMatchArm(arm, visitor);
  }

  visitor.leaveMatch?.(node);
}

/** Walk a single MATCH arm and its body statements. */
export function walkMatchArm(node: MatchArm, visitor: AstVisitor): void {
  visitor.enterMatchArm?.(node);

  for (const stmt of node.body) {
    walkStatement(stmt, visitor);
  }

  visitor.leaveMatchArm?.(node);
}

/** Walk a SET node (leaf). */
export function walkSet(node: SetNode, visitor: AstVisitor): void {
  visitor.enterSet?.(node);
  visitor.leaveSet?.(node);
}

/** Walk a CALL node (leaf). */
export function walkCall(node: CallNode, visitor: AstVisitor): void {
  visitor.enterCall?.(node);
  visitor.leaveCall?.(node);
}

/** Walk a RETURN node (leaf). */
export function walkReturn(node: ReturnNode, visitor: AstVisitor): void {
  visitor.enterReturn?.(node);
  visitor.leaveReturn?.(node);
}

/** Walk a FAIL node (leaf). */
export function walkFail(node: FailNode, visitor: AstVisitor): void {
  visitor.enterFail?.(node);
  visitor.leaveFail?.(node);
}

/** Walk an EMIT node (leaf). */
export function walkEmit(node: EmitNode, visitor: AstVisitor): void {
  visitor.enterEmit?.(node);
  visitor.leaveEmit?.(node);
}

/** Walk a RETRY node and its ON_EXHAUST fallback statements. */
export function walkRetry(node: RetryNode, visitor: AstVisitor): void {
  visitor.enterRetry?.(node);

  for (const stmt of node.onExhaust) {
    walkStatement(stmt, visitor);
  }

  visitor.leaveRetry?.(node);
}

/** Walk a LIMIT node and its onExceed fallback statements. */
export function walkLimit(node: LimitNode, visitor: AstVisitor): void {
  visitor.enterLimit?.(node);

  for (const stmt of node.onExceed) {
    walkStatement(stmt, visitor);
  }

  visitor.leaveLimit?.(node);
}
