// ---------------------------------------------------------------------------
// CodeSpec PEG Grammar (Peggy)
//
// Parses the CodeSpec behavioral specification language into AST nodes that
// match the interfaces defined in src/ast/nodes.ts.
//
// Sections:
//   1. Top-level rules (SpecFile, Module)
//   2. Module member blocks (INPUT, OUTPUT, STATE, ACTION, INVARIANTS, ERRORS, DEPENDS)
//   3. Statements (WHEN, MATCH, SET, CALL, RETURN, FAIL, EMIT, RETRY, LIMIT)
//   4. Types and constraints
//   5. Expressions
//   6. Lexical rules (identifiers, strings, numbers, whitespace, comments)
// ---------------------------------------------------------------------------

// ===========================================================================
// 1. Top-level rules
// ===========================================================================

SpecFile
  = _ items:(ModuleOrComment _)* {
      const modules = [];
      const comments = [];
      for (const [item] of items) {
        if (item.type === "Module") modules.push(item);
        else if (item.type === "Comment") comments.push(item);
      }
      return { type: "SpecFile", modules, comments };
    }

ModuleOrComment
  = Module
  / Comment

Module
  = "MODULE" __ name:Identifier _ "{" _ members:ModuleMembers _ "}" {
      const loc = location();
      const input = members.find(m => m.type === "Input") || undefined;
      const output = members.find(m => m.type === "Output") || undefined;
      const state = members.find(m => m.type === "State") || undefined;
      const actions = members.filter(m => m.type === "Action");
      const invariants = members.find(m => m.type === "Invariants") || undefined;
      const errors = members.find(m => m.type === "Errors") || undefined;
      const depends = members.find(m => m.type === "Depends") || undefined;
      return {
        type: "Module",
        name,
        input,
        output,
        state,
        actions,
        invariants,
        errors,
        depends,
        members,
        loc
      };
    }

ModuleMembers
  = members:(ModuleMember _)* {
      return members.map(([m]) => m);
    }

ModuleMember
  = InputBlock
  / OutputBlock
  / StateBlock
  / ActionBlock
  / InvariantsBlock
  / ErrorsBlock
  / DependsBlock
  / Comment

// ===========================================================================
// 2. Module member blocks
// ===========================================================================

// ---- INPUT ----------------------------------------------------------------

InputBlock
  = "INPUT" _ "{" _ fields:FieldList _ "}" {
      return { type: "Input", fields, loc: location() };
    }

// ---- OUTPUT ---------------------------------------------------------------

OutputBlock
  = "OUTPUT" _ "{" _ fields:FieldList _ "}" {
      return { type: "Output", fields, loc: location() };
    }

// ---- Shared field list for INPUT / OUTPUT ---------------------------------

FieldList
  = first:Field rest:(_ Field)* {
      return [first, ...rest.map(([, f]) => f)];
    }
  / _ { return []; }

Field
  = name:Identifier _ ":" _ fieldType:TypeReference constraints:(_ c:Constraints { return c; })? {
      const result = {
        type: "Field",
        name,
        fieldType,
        loc: location()
      };
      if (constraints) {
        result.constraints = constraints;
      }
      return result;
    }

// ---- STATE ----------------------------------------------------------------

StateBlock
  = "STATE" _ "{" _ fields:StateFieldList _ "}" {
      return { type: "State", fields, loc: location() };
    }

StateFieldList
  = first:StateField rest:(_ StateField)* {
      return [first, ...rest.map(([, f]) => f)];
    }
  / _ { return []; }

StateField
  = access:StateAccess __ name:Identifier _ ":" _ fieldType:TypeReference {
      return { type: "StateField", access, name, fieldType, loc: location() };
    }

StateAccess
  = "READS" !IdentifierPart { return "READS"; }
  / "WRITES" !IdentifierPart { return "WRITES"; }

// ---- ACTION ---------------------------------------------------------------

ActionBlock
  = "ACTION" __ name:Identifier _ "(" _ params:ParameterList _ ")" _ "->" _ returnType:TypeReference _ "{" _ body:StatementList _ "}" {
      return {
        type: "Action",
        name,
        params,
        returnType,
        body,
        loc: location()
      };
    }

ParameterList
  = head:Parameter tail:(_ "," _ Parameter)* {
      return [head, ...tail.map(([,,, p]) => p)];
    }
  / _ { return []; }

Parameter
  = name:Identifier _ ":" _ paramType:TypeReference constraints:(_ c:Constraints { return c; })? {
      const result = {
        type: "Parameter",
        name,
        paramType,
        loc: location()
      };
      if (constraints) {
        result.constraints = constraints;
      }
      return result;
    }

// ---- INVARIANTS -----------------------------------------------------------

InvariantsBlock
  = "INVARIANTS" _ "{" _ rules:InvariantRuleList _ "}" {
      return { type: "Invariants", rules, loc: location() };
    }

InvariantRuleList
  = first:InvariantRule rest:(_ InvariantRule)* {
      return [first, ...rest.map(([, r]) => r)];
    }
  / _ { return []; }

InvariantRule
  = kind:InvariantKind __ description:StringLiteral {
      return { type: "InvariantRule", kind, description };
    }

InvariantKind
  = "ALWAYS" !IdentifierPart { return "ALWAYS"; }
  / "NEVER" !IdentifierPart { return "NEVER"; }

// ---- ERRORS ---------------------------------------------------------------

ErrorsBlock
  = "ERRORS" _ "{" _ errors:ErrorDefList _ "}" {
      return { type: "Errors", errors, loc: location() };
    }

ErrorDefList
  = first:ErrorDef rest:(_ ErrorDef)* {
      return [first, ...rest.map(([, e]) => e)];
    }
  / _ { return []; }

ErrorDef
  = name:Identifier _h status:IntegerLiteral _h message:StringLiteral {
      return { type: "ErrorDef", name, status, message };
    }
  / name:Identifier _h message:StringLiteral {
      return { type: "ErrorDef", name, message };
    }
  / name:Identifier _h status:IntegerLiteral {
      return { type: "ErrorDef", name, status };
    }
  / name:Identifier {
      return { type: "ErrorDef", name };
    }

// ---- DEPENDS --------------------------------------------------------------

DependsBlock
  = "DEPENDS" _ "{" _ deps:DependencyDefList _ "}" {
      return { type: "Depends", dependencies: deps, loc: location() };
    }

DependencyDefList
  = first:DependencyDef rest:(_ DependencyDef)* {
      return [first, ...rest.map(([, d]) => d)];
    }
  / _ { return []; }

DependencyDef
  = name:Identifier _h description:StringLiteral {
      return { type: "DependencyDef", name, description };
    }
  / name:Identifier {
      return { type: "DependencyDef", name };
    }

// ===========================================================================
// 3. Statements (ACTION body)
// ===========================================================================

StatementList
  = first:Statement rest:(_ Statement)* {
      return [first, ...rest.map(([, s]) => s)];
    }
  / _ { return []; }

Statement
  = WhenStatement
  / MatchStatement
  / SetStatement
  / RetryStatement
  / LimitStatement
  / ReturnStatement
  / FailStatement
  / EmitStatement
  / CallStatement
  / Comment

// ---- WHEN / OTHERWISE -----------------------------------------------------

WhenStatement
  = "WHEN" __ condition:Condition "{" _ body:StatementList _ "}" otherwise:(_ o:OtherwiseClause { return o; })? {
      const result = {
        type: "When",
        condition: condition.trim(),
        body,
        loc: location()
      };
      if (otherwise) {
        result.otherwise = otherwise;
      }
      return result;
    }

OtherwiseClause
  = "OTHERWISE" _ "{" _ body:StatementList _ "}" {
      return body;
    }

// Condition: capture everything between WHEN keyword and the opening {
// Each part is a single character that is not { and not a newline followed by
// something that looks like the end of the condition
Condition
  = chars:ConditionChar+ {
      return chars.join("");
    }

ConditionChar
  = !"{" ch:. { return ch; }

// ---- MATCH ----------------------------------------------------------------

MatchStatement
  = "MATCH" __ subject:MatchSubject "{" _ arms:MatchArmList _ "}" {
      return { type: "Match", subject: subject.trim(), arms, loc: location() };
    }

MatchSubject
  = chars:MatchSubjectChar+ {
      return chars.join("");
    }

MatchSubjectChar
  = !"{" ch:. { return ch; }

MatchArmList
  = first:MatchArm rest:(_ MatchArm)* {
      return [first, ...rest.map(([, a]) => a)];
    }
  / _ { return []; }

MatchArm
  = pattern:MatchPattern _ "->" _ "{" _ body:StatementList _ "}" {
      return { type: "MatchArm", pattern, body, loc: location() };
    }
  / pattern:MatchPattern _ "->" _ stmt:SingleStatement {
      return { type: "MatchArm", pattern, body: [stmt], loc: location() };
    }

MatchPattern
  = str:StringLiteral { return str; }
  / "_" !IdentifierPart { return "_"; }
  / id:Identifier { return id; }

// A single inline statement (for single-line match arms without braces)
SingleStatement
  = FailStatement
  / ReturnStatement
  / EmitStatement
  / CallStatement
  / SetStatement

// ---- SET ------------------------------------------------------------------

SetStatement
  = "SET" __ variable:Identifier _ "=" _ value:Expression {
      return { type: "Set", variable, value, loc: location() };
    }

// ---- CALL (standalone, not inside SET) ------------------------------------

CallStatement
  = "CALL" __ target:DottedIdentifier _ "(" _ args:ArgumentList _ ")" {
      return { type: "Call", target, args, loc: location() };
    }

DottedIdentifier "dotted identifier"
  = $([a-zA-Z_][a-zA-Z0-9_.]*)

// ---- RETURN ---------------------------------------------------------------

ReturnStatement
  = "RETURN" __ value:ReturnValue {
      return { type: "Return", value: value.trim(), loc: location() };
    }

ReturnValue
  = chars:$[^\n\r}]+ { return chars; }

// ---- FAIL -----------------------------------------------------------------

FailStatement
  = "FAIL" __ error:Identifier _h message:StringLiteral {
      return { type: "Fail", error, message, loc: location() };
    }
  / "FAIL" __ error:Identifier {
      return { type: "Fail", error, loc: location() };
    }

// ---- EMIT -----------------------------------------------------------------

EmitStatement
  = "EMIT" __ event:Identifier _ payload:EmitPayload? {
      const result = { type: "Emit", event, loc: location() };
      if (payload !== null && payload !== undefined) {
        result.payload = payload;
      }
      return result;
    }

EmitPayload
  = "{" _ content:PayloadContent _ "}" {
      return content.trim();
    }

PayloadContent
  = chars:$[^}]* { return chars; }

// ---- RETRY / ON_EXHAUST ---------------------------------------------------

RetryStatement
  = "RETRY" __ "CALL" __ target:Identifier _ "(" _ args:ArgumentList _ ")" __ attempts:IntegerLiteral __ "TIMES" !IdentifierPart delay:DelayClause? _ "{" _ exhaustClause:OnExhaustClause _ "}" {
      const result = {
        type: "Retry",
        target,
        attempts,
        onExhaust: exhaustClause,
        loc: location()
      };
      if (delay !== null && delay !== undefined) {
        result.delay = delay;
      }
      return result;
    }

DelayClause
  = __ "DELAY" !IdentifierPart __ value:StringLiteral {
      return value;
    }

OnExhaustClause
  = "ON_EXHAUST" _ "{" _ body:StatementList _ "}" {
      return body;
    }

// ---- LIMIT ----------------------------------------------------------------

LimitStatement
  = "LIMIT" __ rate:LimitValue __ "PER" !IdentifierPart __ per:LimitValue _ "{" _ onExceed:OnExceedClause _ "}" {
      return { type: "Limit", rate, per, onExceed, loc: location() };
    }

LimitValue
  = $[a-zA-Z0-9_"]+

OnExceedClause
  = "ON_EXCEED" _ "{" _ body:StatementList _ "}" {
      return body;
    }

// ===========================================================================
// 4. Types and constraints
// ===========================================================================

TypeReference
  = type:BaseType "?" {
      return { kind: "optional", innerType: type };
    }
  / BaseType

BaseType
  = ListType
  / MapType
  / PrimitiveType
  / NamedType

PrimitiveType
  = name:PrimitiveTypeName !IdentifierPart {
      return { kind: "primitive", name };
    }

PrimitiveTypeName
  = "String"   { return "String"; }
  / "DateTime" { return "DateTime"; }
  / "Int"      { return "Int"; }
  / "Float"    { return "Float"; }
  / "Bool"     { return "Bool"; }
  / "Email"    { return "Email"; }
  / "Hash"     { return "Hash"; }
  / "UUID"     { return "UUID"; }
  / "Void"     { return "Void"; }

ListType
  = "List" _ "<" _ elementType:TypeReference _ ">" {
      return { kind: "list", elementType };
    }

MapType
  = "Map" _ "<" _ keyType:TypeReference _ "," _ valueType:TypeReference _ ">" {
      return { kind: "map", keyType, valueType };
    }

NamedType
  = !ReservedWord name:Identifier {
      return { kind: "named", name };
    }

// All keywords and built-in type names that must not be parsed as named types.
// The trailing !IdentifierPart ensures we only reject whole-word matches
// (e.g., "INPUTStream" is a valid named type, but "INPUT" alone is not).
ReservedWord
  = ("MODULE" / "INPUT" / "OUTPUT" / "STATE" / "ACTION" / "WHEN" / "OTHERWISE"
  / "MATCH" / "SET" / "CALL" / "RETURN" / "FAIL" / "EMIT" / "RETRY"
  / "ON_EXHAUST" / "LIMIT" / "ON_EXCEED" / "PER" / "INVARIANTS" / "ERRORS"
  / "DEPENDS" / "ALWAYS" / "NEVER" / "READS" / "WRITES" / "TIMES" / "DELAY"
  / "String" / "DateTime" / "Int" / "Float" / "Bool" / "Email" / "Hash"
  / "UUID" / "Void" / "List" / "Map") !IdentifierPart

// ---- Constraints ----------------------------------------------------------

Constraints
  = "[" _ head:Constraint tail:(_ "," _ Constraint)* _ "]" {
      const all = [head, ...tail.map(([,,, c]) => c)];
      const result = {};
      for (const c of all) {
        result[c.key] = c.value;
      }
      return result;
    }

Constraint
  = "min" _ ":" _ value:NumberLiteral    { return { key: "min", value }; }
  / "max" _ ":" _ value:NumberLiteral    { return { key: "max", value }; }
  / "pattern" _ ":" _ value:StringLiteral { return { key: "pattern", value }; }
  / "format" _ ":" _ value:FormatName     { return { key: "format", value }; }
  / "enum" _ ":" _ "(" _ values:EnumValueList _ ")" { return { key: "enum", value: values }; }

FormatName
  = $([a-zA-Z_][a-zA-Z0-9_]*)

EnumValueList
  = head:StringLiteral tail:(_ "," _ StringLiteral)* {
      return [head, ...tail.map(([,,, s]) => s)];
    }

// ===========================================================================
// 5. Expressions
// ===========================================================================

// Expression used in SET rhs — tries CALL first, then falls back to raw text
Expression
  = "CALL" __ target:DottedIdentifier _ "(" _ args:ArgumentList _ ")" {
      return "CALL " + target + "(" + args.join(", ") + ")";
    }
  / chars:$[^\n\r}]+ {
      return chars.trim();
    }

// Arguments to a CALL
ArgumentList
  = head:Argument tail:(_ "," _ Argument)* {
      return [head, ...tail.map(([,,, a]) => a)];
    }
  / _ { return []; }

Argument
  = str:StringLiteral { return str; }
  / chars:$([a-zA-Z_][a-zA-Z0-9_.]*)  { return chars; }

// ===========================================================================
// 6. Lexical rules
// ===========================================================================

// ---- Identifiers ----------------------------------------------------------

Identifier "identifier"
  = $([a-zA-Z_][a-zA-Z0-9_]*)

IdentifierPart
  = [a-zA-Z0-9_]

// ---- Literals -------------------------------------------------------------

StringLiteral "string"
  = '"' chars:$DoubleStringChar* '"' { return chars; }

DoubleStringChar
  = "\\" . // escaped character
  / [^"\\] // any character except quote and backslash

IntegerLiteral "integer"
  = digits:$[0-9]+ { return parseInt(digits, 10); }

NumberLiteral "number"
  = whole:$[0-9]+ "." frac:$[0-9]+ {
      return parseFloat(whole + "." + frac);
    }
  / digits:$[0-9]+ {
      return parseInt(digits, 10);
    }

// ---- Comments -------------------------------------------------------------

Comment "comment"
  = "--" text:$[^\n\r]* {
      return { type: "Comment", text: text.trim(), loc: location() };
    }

// ---- Whitespace -----------------------------------------------------------

// Optional whitespace (including newlines). Does NOT consume comments
// so that Comment nodes can be captured by their parent rules.
_ "optional whitespace"
  = [ \t\n\r]*

// Required whitespace (at least one whitespace character)
__ "required whitespace"
  = [ \t\n\r]+

// Horizontal whitespace only (spaces and tabs, NOT newlines).
// Used where a value must appear on the same line as its keyword.
_h "horizontal whitespace"
  = [ \t]+
