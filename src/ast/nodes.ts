// ---------------------------------------------------------------------------
// CodeSpec AST Node Type Definitions
//
// Every node is immutable (readonly properties). The `type` field on each node
// forms a discriminated union so consumers can narrow with a simple switch.
// ---------------------------------------------------------------------------

// ---- Source location -------------------------------------------------------

/** A single position in source text. */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/** A range in source text, used for error reporting. */
export interface SourceRange {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
  readonly source?: string;
}

// ---- Primitive & collection type system -----------------------------------

/** Primitive type names supported by CodeSpec. */
export type PrimitiveTypeName =
  | "String"
  | "Int"
  | "Float"
  | "Bool"
  | "DateTime"
  | "Email"
  | "Hash"
  | "UUID"
  | "Void";

/** A primitive type reference. */
export interface PrimitiveType {
  readonly kind: "primitive";
  readonly name: PrimitiveTypeName;
}

/** A List<T> collection type. */
export interface ListType {
  readonly kind: "list";
  readonly elementType: TypeReference;
}

/** A Map<K, V> collection type. */
export interface MapType {
  readonly kind: "map";
  readonly keyType: TypeReference;
  readonly valueType: TypeReference;
}

/** A reference to a custom/named type (e.g. another MODULE or external type). */
export interface NamedType {
  readonly kind: "named";
  readonly name: string;
}

/** An optional wrapper around any type. */
export interface OptionalType {
  readonly kind: "optional";
  readonly innerType: TypeReference;
}

/** Any type reference in the CodeSpec type system. */
export type TypeReference =
  | PrimitiveType
  | ListType
  | MapType
  | NamedType
  | OptionalType;

// ---- Constraints ----------------------------------------------------------

/** Constraints that can be applied to a field or parameter. */
export interface Constraints {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly enum?: readonly string[];
}

// ---- Fields ---------------------------------------------------------------

/** A typed field with optional constraints (used in INPUT, OUTPUT). */
export interface FieldNode {
  readonly type: "Field";
  readonly name: string;
  readonly fieldType: TypeReference;
  readonly constraints?: Constraints;
  readonly description?: string;
  readonly loc?: SourceRange;
}

// ---- Parameters -----------------------------------------------------------

/** A parameter to an ACTION. */
export interface ParameterNode {
  readonly type: "Parameter";
  readonly name: string;
  readonly paramType: TypeReference;
  readonly constraints?: Constraints;
  readonly loc?: SourceRange;
}

// ---- Top-level blocks -----------------------------------------------------

/** INPUT block — declares the module's input interface. */
export interface InputNode {
  readonly type: "Input";
  readonly fields: readonly FieldNode[];
  readonly loc?: SourceRange;
}

/** OUTPUT block — declares the module's output interface. */
export interface OutputNode {
  readonly type: "Output";
  readonly fields: readonly FieldNode[];
  readonly loc?: SourceRange;
}

/** Access mode for a state field. */
export type StateAccess = "READS" | "WRITES";

/** A single state field declaration with access mode. */
export interface StateFieldNode {
  readonly type: "StateField";
  readonly access: StateAccess;
  readonly name: string;
  readonly fieldType: TypeReference;
  readonly loc?: SourceRange;
}

/** STATE block — declares what data the module reads and writes. */
export interface StateNode {
  readonly type: "State";
  readonly fields: readonly StateFieldNode[];
  readonly loc?: SourceRange;
}

// ---- Action body statements -----------------------------------------------

/** WHEN / OTHERWISE conditional guard. */
export interface WhenNode {
  readonly type: "When";
  readonly condition: string;
  readonly body: readonly StatementNode[];
  readonly otherwise?: readonly StatementNode[];
  readonly loc?: SourceRange;
}

/** A single arm in a MATCH expression. */
export interface MatchArm {
  readonly type: "MatchArm";
  readonly pattern: string;
  readonly body: readonly StatementNode[];
  readonly loc?: SourceRange;
}

/** MATCH — pattern matching on a value. */
export interface MatchNode {
  readonly type: "Match";
  readonly subject: string;
  readonly arms: readonly MatchArm[];
  readonly loc?: SourceRange;
}

/** SET — variable assignment. */
export interface SetNode {
  readonly type: "Set";
  readonly variable: string;
  readonly value: string;
  readonly loc?: SourceRange;
}

/** CALL — invokes a dependency or internal action. */
export interface CallNode {
  readonly type: "Call";
  readonly target: string;
  readonly args: readonly string[];
  readonly assignTo?: string;
  readonly loc?: SourceRange;
}

/** RETURN — returns a value from an action. */
export interface ReturnNode {
  readonly type: "Return";
  readonly value: string;
  readonly loc?: SourceRange;
}

/** FAIL — raises a named error. */
export interface FailNode {
  readonly type: "Fail";
  readonly error: string;
  readonly message?: string;
  readonly loc?: SourceRange;
}

/** EMIT — fires a domain event. */
export interface EmitNode {
  readonly type: "Emit";
  readonly event: string;
  readonly payload?: string;
  readonly loc?: SourceRange;
}

/** RETRY — retry logic with ON_EXHAUST fallback. */
export interface RetryNode {
  readonly type: "Retry";
  readonly target: string;
  readonly attempts: number;
  readonly delay?: string;
  readonly onExhaust: readonly StatementNode[];
  readonly loc?: SourceRange;
}

/** LIMIT — rate limiting declaration. */
export interface LimitNode {
  readonly type: "Limit";
  readonly rate: string;
  readonly per: string;
  readonly onExceed: readonly StatementNode[];
  readonly loc?: SourceRange;
}

/** A comment node (-- style). Preserved for round-trip fidelity. */
export interface CommentNode {
  readonly type: "Comment";
  readonly text: string;
  readonly loc?: SourceRange;
}

/** Any statement that can appear inside an ACTION body. */
export type StatementNode =
  | WhenNode
  | MatchNode
  | SetNode
  | CallNode
  | ReturnNode
  | FailNode
  | EmitNode
  | RetryNode
  | LimitNode
  | CommentNode;

// ---- ACTION ---------------------------------------------------------------

/** ACTION — a behavioral unit (maps to a function/method). */
export interface ActionNode {
  readonly type: "Action";
  readonly name: string;
  readonly params: readonly ParameterNode[];
  readonly returnType: TypeReference;
  readonly body: readonly StatementNode[];
  readonly loc?: SourceRange;
}

// ---- INVARIANTS -----------------------------------------------------------

/** A single invariant rule (ALWAYS or NEVER). */
export interface InvariantRule {
  readonly type: "InvariantRule";
  readonly kind: "ALWAYS" | "NEVER";
  readonly description: string;
}

/** INVARIANTS block — behavioral guarantees (natural language by design). */
export interface InvariantsNode {
  readonly type: "Invariants";
  readonly rules: readonly InvariantRule[];
  readonly loc?: SourceRange;
}

// ---- ERRORS ---------------------------------------------------------------

/** A single named error type with optional HTTP status. */
export interface ErrorDef {
  readonly type: "ErrorDef";
  readonly name: string;
  readonly status?: number;
  readonly message?: string;
}

/** ERRORS block — named error types. */
export interface ErrorsNode {
  readonly type: "Errors";
  readonly errors: readonly ErrorDef[];
  readonly loc?: SourceRange;
}

// ---- DEPENDS --------------------------------------------------------------

/** A single external dependency declaration. */
export interface DependencyDef {
  readonly type: "DependencyDef";
  readonly name: string;
  readonly description?: string;
}

/** DEPENDS block — external service dependencies. */
export interface DependsNode {
  readonly type: "Depends";
  readonly dependencies: readonly DependencyDef[];
  readonly loc?: SourceRange;
}

// ---- MODULE (root) --------------------------------------------------------

/** A member block inside a MODULE (used for ordering in serialization). */
export type ModuleMember =
  | InputNode
  | OutputNode
  | StateNode
  | ActionNode
  | InvariantsNode
  | ErrorsNode
  | DependsNode
  | CommentNode;

/** MODULE — the top-level container for a CodeSpec specification. */
export interface ModuleNode {
  readonly type: "Module";
  readonly name: string;
  readonly input?: InputNode;
  readonly output?: OutputNode;
  readonly state?: StateNode;
  readonly actions: readonly ActionNode[];
  readonly invariants?: InvariantsNode;
  readonly errors?: ErrorsNode;
  readonly depends?: DependsNode;
  /** Ordered list of members for serialization round-trip fidelity. */
  readonly members: readonly ModuleMember[];
  readonly loc?: SourceRange;
}

// ---- Top-level union ------------------------------------------------------

/** Any top-level AST node. */
export type AstNode = ModuleNode | CommentNode;

/** A complete CodeSpec specification (one or more modules). */
export interface SpecFile {
  readonly type: "SpecFile";
  readonly modules: readonly ModuleNode[];
  readonly comments: readonly CommentNode[];
}
