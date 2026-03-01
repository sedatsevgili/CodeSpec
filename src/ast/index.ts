export type {
  // Source location
  SourceLocation,
  SourceRange,

  // Type system
  PrimitiveTypeName,
  PrimitiveType,
  ListType,
  MapType,
  NamedType,
  OptionalType,
  TypeReference,
  Constraints,

  // Fields & parameters
  FieldNode,
  ParameterNode,

  // Top-level blocks
  InputNode,
  OutputNode,
  StateAccess,
  StateFieldNode,
  StateNode,

  // Statements
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

  // Action
  ActionNode,

  // Invariants
  InvariantRule,
  InvariantsNode,

  // Errors
  ErrorDef,
  ErrorsNode,

  // Dependencies
  DependencyDef,
  DependsNode,

  // Module
  ModuleMember,
  ModuleNode,

  // Top-level
  AstNode,
  SpecFile,
} from "./nodes.js";

// Builder helpers
export {
  primitiveType,
  listType,
  mapType,
  namedType,
  optionalType,
  constraints,
  field,
  parameter,
  input,
  output,
  stateField,
  state,
  when,
  matchArm,
  match,
  set,
  call,
  returnNode,
  fail,
  emit,
  retry,
  limit,
  comment,
  action,
  invariantRule,
  invariants,
  errorDef,
  errors,
  dependencyDef,
  depends,
  module,
  specFile,
} from "./builder.js";

// Visitor / walker
export type { AstVisitor } from "./visitor.js";
export {
  walkSpecFile,
  walkModule,
  walkModuleMember,
  walkInput,
  walkOutput,
  walkState,
  walkAction,
  walkInvariants,
  walkErrors,
  walkDepends,
  walkComment,
  walkField,
  walkParameter,
  walkStateField,
  walkInvariantRule,
  walkErrorDef,
  walkDependencyDef,
  walkStatement,
  walkWhen,
  walkMatch,
  walkMatchArm,
  walkSet,
  walkCall,
  walkReturn,
  walkFail,
  walkEmit,
  walkRetry,
  walkLimit,
} from "./visitor.js";
