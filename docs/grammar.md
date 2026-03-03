# CodeSpec Grammar Reference

This document presents the CodeSpec grammar in Extended Backus-Naur Form (EBNF) notation, organized by section. The grammar is implemented using [Peggy](https://peggyjs.org/) (a PEG parser generator), which means alternatives are tried in order (ordered choice) and the first match wins.

For the semantic description of each construct, see [language-spec.md](language-spec.md).

## Table of Contents

- [Notation](#notation)
- [1. Top-Level Rules](#1-top-level-rules)
- [2. Module Members](#2-module-members)
- [3. Fields and Parameters](#3-fields-and-parameters)
- [4. Statements](#4-statements)
- [5. Types and Constraints](#5-types-and-constraints)
- [6. Expressions and Arguments](#6-expressions-and-arguments)
- [7. Lexical Rules](#7-lexical-rules)
- [Notes on Precedence and Ambiguity](#notes-on-precedence-and-ambiguity)

---

## Notation

This document uses the following EBNF conventions:

| Notation      | Meaning                                         |
|---------------|--------------------------------------------------|
| `=`           | Definition                                       |
| `\|`          | Alternative (ordered choice in PEG)              |
| `( ... )`     | Grouping                                         |
| `[ ... ]`     | Optional (zero or one)                           |
| `{ ... }`     | Repetition (zero or more)                        |
| `{ ... }+`    | Repetition (one or more)                         |
| `"..."`       | Terminal string (keyword or symbol)              |
| `'...'`       | Terminal string (alternate quoting)              |
| `/* ... */`   | Comment                                          |
| `_`           | Optional whitespace (spaces, tabs, newlines)     |
| `__`          | Required whitespace (at least one)               |
| `_h`          | Horizontal whitespace only (spaces, tabs)        |

---

## 1. Top-Level Rules

```ebnf
SpecFile
    = _ { ( ModuleOrComment _ ) } ;

ModuleOrComment
    = Module
    | Comment ;

Module
    = "MODULE" __ Identifier _ "{" _ ModuleMembers _ "}" ;

ModuleMembers
    = { ModuleMember _ } ;

ModuleMember
    = InputBlock
    | OutputBlock
    | StateBlock
    | ActionBlock
    | InvariantsBlock
    | ErrorsBlock
    | DependsBlock
    | Comment ;
```

A `SpecFile` is the root production. It consists of zero or more modules and top-level comments, separated by optional whitespace. Each `Module` contains an identifier (the module name) and a block of member declarations.

---

## 2. Module Members

### INPUT and OUTPUT

```ebnf
InputBlock
    = "INPUT" _ "{" _ FieldList _ "}" ;

OutputBlock
    = "OUTPUT" _ "{" _ FieldList _ "}" ;

FieldList
    = Field { _ Field }
    | _ ;                              /* empty */
```

Both INPUT and OUTPUT blocks share the same field list syntax.

### STATE

```ebnf
StateBlock
    = "STATE" _ "{" _ StateFieldList _ "}" ;

StateFieldList
    = StateField { _ StateField }
    | _ ;                              /* empty */

StateField
    = StateAccess __ Identifier _ ":" _ TypeReference ;

StateAccess
    = "READS"  !IdentifierPart
    | "WRITES" !IdentifierPart ;
```

The `!IdentifierPart` negative lookahead ensures `READS` and `WRITES` are matched as whole keywords, not as prefixes of longer identifiers.

### ACTION

```ebnf
ActionBlock
    = "ACTION" __ Identifier _ "(" _ ParameterList _ ")" _ "->" _ TypeReference
      _ "{" _ StatementList _ "}" ;

ParameterList
    = Parameter { _ "," _ Parameter }
    | _ ;                              /* empty */

Parameter
    = Identifier _ ":" _ TypeReference [ _ Constraints ] ;
```

### INVARIANTS

```ebnf
InvariantsBlock
    = "INVARIANTS" _ "{" _ InvariantRuleList _ "}" ;

InvariantRuleList
    = InvariantRule { _ InvariantRule }
    | _ ;                              /* empty */

InvariantRule
    = InvariantKind __ StringLiteral ;

InvariantKind
    = "ALWAYS" !IdentifierPart
    | "NEVER"  !IdentifierPart ;
```

### ERRORS

```ebnf
ErrorsBlock
    = "ERRORS" _ "{" _ ErrorDefList _ "}" ;

ErrorDefList
    = ErrorDef { _ ErrorDef }
    | _ ;                              /* empty */

ErrorDef
    = Identifier _h IntegerLiteral _h StringLiteral   /* name, status, message */
    | Identifier _h StringLiteral                     /* name, message only */
    | Identifier _h IntegerLiteral                    /* name, status only */
    | Identifier ;                                    /* name only */
```

Error definitions use horizontal whitespace (`_h`) to keep the status code and message on the same line as the error name. The four alternatives are tried in order, so the most specific form (name + status + message) is matched first.

### DEPENDS

```ebnf
DependsBlock
    = "DEPENDS" _ "{" _ DependencyDefList _ "}" ;

DependencyDefList
    = DependencyDef { _ DependencyDef }
    | _ ;                              /* empty */

DependencyDef
    = Identifier _h StringLiteral     /* name with description */
    | Identifier ;                    /* name only */
```

---

## 3. Fields and Parameters

```ebnf
Field
    = Identifier _ ":" _ TypeReference [ _ Constraints ] ;

Parameter
    = Identifier _ ":" _ TypeReference [ _ Constraints ] ;
```

Fields (in INPUT/OUTPUT) and parameters (in ACTION) share the same structure: a name, a type, and optional constraints. The only difference is their position in the grammar.

---

## 4. Statements

### Statement List

```ebnf
StatementList
    = Statement { _ Statement }
    | _ ;                              /* empty */

Statement
    = WhenStatement
    | MatchStatement
    | SetStatement
    | RetryStatement
    | LimitStatement
    | ReturnStatement
    | FailStatement
    | EmitStatement
    | CallStatement
    | Comment ;
```

Statements are tried in the order listed. This ordering is significant for PEG parsers: RETRY must be tried before CALL (since RETRY contains `CALL` as a sub-token), and SET must be tried before CALL and RETURN (to avoid prefix ambiguity).

### WHEN / OTHERWISE

```ebnf
WhenStatement
    = "WHEN" __ Condition "{" _ StatementList _ "}" [ _ OtherwiseClause ] ;

OtherwiseClause
    = "OTHERWISE" _ "{" _ StatementList _ "}" ;

Condition
    = { ConditionChar }+ ;

ConditionChar
    = !"{" . ;                         /* any character except '{' */
```

The condition is captured as raw text -- everything between `WHEN` and the opening `{`. This allows conditions to contain arbitrary expressions including CALL, comparisons, and boolean operators.

### MATCH

```ebnf
MatchStatement
    = "MATCH" __ MatchSubject "{" _ MatchArmList _ "}" ;

MatchSubject
    = { MatchSubjectChar }+ ;

MatchSubjectChar
    = !"{" . ;                         /* any character except '{' */

MatchArmList
    = MatchArm { _ MatchArm }
    | _ ;                              /* empty */

MatchArm
    = MatchPattern _ "->" _ "{" _ StatementList _ "}"   /* block form */
    | MatchPattern _ "->" _ SingleStatement ;            /* inline form */

MatchPattern
    = StringLiteral                    /* e.g. "admin" */
    | "_" !IdentifierPart             /* wildcard */
    | Identifier ;                     /* e.g. Active, Pending */

SingleStatement
    = FailStatement
    | ReturnStatement
    | EmitStatement
    | CallStatement
    | SetStatement ;
```

Match arms support two forms: a block form with braces for multiple statements, and an inline form for single statements. The inline form is tried second (PEG ordered choice), so the block form is preferred when both could match.

### SET

```ebnf
SetStatement
    = "SET" __ Identifier _ "=" _ Expression ;
```

### CALL (standalone)

```ebnf
CallStatement
    = "CALL" __ Identifier _ "(" _ ArgumentList _ ")" ;
```

### RETURN

```ebnf
ReturnStatement
    = "RETURN" __ ReturnValue ;

ReturnValue
    = [^\n\r}]+ ;                     /* text until newline or closing brace */
```

### FAIL

```ebnf
FailStatement
    = "FAIL" __ Identifier _h StringLiteral   /* with message */
    | "FAIL" __ Identifier ;                  /* without message */
```

The form with a message is tried first. Horizontal whitespace (`_h`) keeps the error name and message on the same line.

### EMIT

```ebnf
EmitStatement
    = "EMIT" __ Identifier [ _ EmitPayload ] ;

EmitPayload
    = "{" _ PayloadContent _ "}" ;

PayloadContent
    = [^}]* ;                          /* any text until closing brace */
```

### RETRY / ON_EXHAUST

```ebnf
RetryStatement
    = "RETRY" __ "CALL" __ Identifier _ "(" _ ArgumentList _ ")"
      __ IntegerLiteral __ "TIMES" !IdentifierPart
      [ DelayClause ]
      _ "{" _ OnExhaustClause _ "}" ;

DelayClause
    = __ "DELAY" !IdentifierPart __ StringLiteral ;

OnExhaustClause
    = "ON_EXHAUST" _ "{" _ StatementList _ "}" ;
```

### LIMIT / ON_EXCEED

```ebnf
LimitStatement
    = "LIMIT" __ LimitValue __ "PER" !IdentifierPart __ LimitValue
      _ "{" _ OnExceedClause _ "}" ;

LimitValue
    = [a-zA-Z0-9_"]+ ;

OnExceedClause
    = "ON_EXCEED" _ "{" _ StatementList _ "}" ;
```

The `LimitValue` production is permissive, accepting alphanumeric characters, underscores, and double quotes. This allows both numeric values (`100`) and quoted strings (`"minute"`) as rate and period values.

---

## 5. Types and Constraints

### Type References

```ebnf
TypeReference
    = BaseType "?"                     /* optional type */
    | BaseType ;

BaseType
    = ListType
    | MapType
    | PrimitiveType
    | NamedType ;

PrimitiveType
    = PrimitiveTypeName !IdentifierPart ;

PrimitiveTypeName
    = "String"
    | "DateTime"
    | "Int"
    | "Float"
    | "Bool"
    | "Email"
    | "Hash"
    | "UUID"
    | "Void" ;

ListType
    = "List" _ "<" _ TypeReference _ ">" ;

MapType
    = "Map" _ "<" _ TypeReference _ "," _ TypeReference _ ">" ;

NamedType
    = !ReservedWord Identifier ;
```

Type references are tried in order: optional wrapping is checked first (by looking for a trailing `?`), then the base type alternatives. Within base types, `List` and `Map` are tried before `PrimitiveType`, which is tried before `NamedType`. The negative lookahead `!ReservedWord` prevents keywords from being parsed as named types.

Note that `DateTime` is listed before `Int` in the `PrimitiveTypeName` alternatives. In a PEG parser this is not strictly necessary (since `!IdentifierPart` prevents `Int` from matching the prefix of `Integer`), but the ordering is chosen to avoid any ambiguity with identifier-like prefixes.

### Constraints

```ebnf
Constraints
    = "[" _ Constraint { _ "," _ Constraint } _ "]" ;

Constraint
    = "min" _ ":" _ NumberLiteral
    | "max" _ ":" _ NumberLiteral
    | "pattern" _ ":" _ StringLiteral
    | "format" _ ":" _ FormatName
    | "enum" _ ":" _ "(" _ EnumValueList _ ")" ;

FormatName
    = [a-zA-Z_] { [a-zA-Z0-9_] } ;

EnumValueList
    = StringLiteral { _ "," _ StringLiteral } ;
```

### Reserved Words

```ebnf
ReservedWord
    = ( "MODULE" | "INPUT" | "OUTPUT" | "STATE" | "ACTION"
      | "WHEN" | "OTHERWISE" | "MATCH" | "SET" | "CALL"
      | "RETURN" | "FAIL" | "EMIT" | "RETRY" | "ON_EXHAUST"
      | "LIMIT" | "ON_EXCEED" | "PER" | "INVARIANTS" | "ERRORS"
      | "DEPENDS" | "ALWAYS" | "NEVER" | "READS" | "WRITES"
      | "TIMES" | "DELAY"
      | "String" | "DateTime" | "Int" | "Float" | "Bool"
      | "Email" | "Hash" | "UUID" | "Void" | "List" | "Map"
      ) !IdentifierPart ;
```

Reserved word matching is whole-word: `!IdentifierPart` ensures that, for example, `INPUTStream` is not reserved (because `S` is an `IdentifierPart`), while `INPUT` followed by whitespace or `{` is reserved.

---

## 6. Expressions and Arguments

```ebnf
Expression
    = "CALL" __ Identifier _ "(" _ ArgumentList _ ")"    /* CALL expression */
    | [^\n\r}]+ ;                                        /* raw text fallback */

ArgumentList
    = Argument { _ "," _ Argument }
    | _ ;                              /* empty */

Argument
    = StringLiteral                    /* e.g. "hello" */
    | [a-zA-Z_] { [a-zA-Z0-9_.] } ;   /* identifier, possibly with dots */
```

Expressions appear on the right-hand side of SET statements. The CALL form is tried first (PEG ordered choice); if it does not match, the raw text fallback captures everything until end of line or closing brace.

Arguments support dot-notation for property access (e.g., `user.email`, `config.maxRetries`).

---

## 7. Lexical Rules

### Identifiers

```ebnf
Identifier
    = [a-zA-Z_] { [a-zA-Z0-9_] } ;

IdentifierPart
    = [a-zA-Z0-9_] ;
```

An identifier starts with a letter or underscore, followed by zero or more letters, digits, or underscores. `IdentifierPart` is used in negative lookahead assertions to enforce whole-word keyword matching.

### String Literals

```ebnf
StringLiteral
    = '"' { DoubleStringChar } '"' ;

DoubleStringChar
    = "\\" .             /* escaped character (any char after backslash) */
    | [^"\\] ;           /* any character except quote and backslash */
```

Strings are delimited by double quotes. Within a string, backslashes escape the following character. This allows `\"` for literal quotes and `\\` for literal backslashes.

### Integer Literals

```ebnf
IntegerLiteral
    = [0-9]+ ;
```

### Number Literals

```ebnf
NumberLiteral
    = [0-9]+ "." [0-9]+    /* floating-point */
    | [0-9]+ ;              /* integer */
```

The floating-point form is tried first (PEG ordered choice), so `3.14` is parsed as a float, not as the integer `3` followed by `.14`.

### Comments

```ebnf
Comment
    = "--" [^\n\r]* ;
```

A comment starts with `--` and extends to the end of the line. The text after `--` (with leading/trailing whitespace trimmed) is preserved in the AST.

### Whitespace

```ebnf
_    /* optional whitespace */
    = [ \t\n\r]* ;

__   /* required whitespace */
    = [ \t\n\r]+ ;

_h   /* horizontal whitespace only */
    = [ \t]+ ;
```

- `_` matches zero or more whitespace characters (spaces, tabs, newlines, carriage returns). Used between most tokens.
- `__` matches one or more whitespace characters. Used between keywords and identifiers to enforce separation.
- `_h` matches one or more horizontal whitespace characters (spaces and tabs only, no newlines). Used in error definitions and dependency definitions where elements must appear on the same line.

Note that whitespace rules do **not** consume comments. Comments are parsed explicitly by their parent rules to ensure they are captured as AST nodes.

---

## Notes on Precedence and Ambiguity

### PEG Ordered Choice

CodeSpec uses a PEG (Parsing Expression Grammar) parser. Unlike CFGs (Context-Free Grammars), PEG alternatives are **ordered**: the parser tries each alternative in sequence and commits to the first one that matches. This eliminates ambiguity but makes alternative ordering significant.

### Key Ordering Decisions

1. **Statement alternatives.** `WhenStatement` and `MatchStatement` are tried before simpler statements. `RetryStatement` is tried before `CallStatement` because RETRY begins with `RETRY CALL ...`, which would otherwise match as a plain CALL. `SetStatement` is tried before `CallStatement` because SET may contain a CALL in its expression.

2. **Type alternatives.** `ListType` and `MapType` are tried before `PrimitiveType`, which is tried before `NamedType`. This ensures that `List<String>` is parsed as a list type, not as a named type `List` followed by unparsed text.

3. **ErrorDef alternatives.** The four forms are ordered from most specific to least specific: `Name Status Message`, `Name Message`, `Name Status`, `Name`. This ensures the parser greedily matches all available components.

4. **FailStatement alternatives.** The form with a message (`FAIL Name "message"`) is tried before the form without (`FAIL Name`), ensuring the message is captured when present.

5. **MatchArm alternatives.** The block form (`pattern -> { ... }`) is tried before the inline form (`pattern -> statement`), so the opening brace is not mistakenly parsed as part of an inline statement.

### Keyword Boundaries

All keywords use `!IdentifierPart` negative lookahead to enforce whole-word matching. Without this, `READS` could match as a prefix of `READStream`, and `Int` could match as a prefix of `Internal`. The negative lookahead ensures the character immediately following the keyword is not a letter, digit, or underscore.

### Condition and Subject Capture

The `Condition` (in WHEN) and `MatchSubject` (in MATCH) productions use a greedy capture of all characters up to the opening `{`. This is a deliberate design choice: conditions and subjects are treated as opaque text, allowing arbitrary expressions without needing a full expression grammar. The trade-off is that the parser does not validate condition syntax -- that responsibility falls to the generator or validator.

### Whitespace Handling

Whitespace is explicitly managed rather than automatically skipped. This gives precise control over where newlines are significant (e.g., error definitions must be on a single line) versus where they are ignored (e.g., between module members). The three whitespace rules (`_`, `__`, `_h`) provide the necessary granularity.
