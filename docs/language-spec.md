# CodeSpec Language Specification

Version 1.0

## Table of Contents

- [1. Overview](#1-overview)
- [2. Design Philosophy](#2-design-philosophy)
- [3. Document Structure](#3-document-structure)
- [4. Module](#4-module)
- [5. INPUT Block](#5-input-block)
- [6. OUTPUT Block](#6-output-block)
- [7. STATE Block](#7-state-block)
- [8. ACTION Block](#8-action-block)
- [9. Statements](#9-statements)
  - [9.1 WHEN / OTHERWISE](#91-when--otherwise)
  - [9.2 MATCH](#92-match)
  - [9.3 SET](#93-set)
  - [9.4 CALL](#94-call)
  - [9.5 RETURN](#95-return)
  - [9.6 FAIL](#96-fail)
  - [9.7 EMIT](#97-emit)
  - [9.8 RETRY / ON_EXHAUST](#98-retry--on_exhaust)
  - [9.9 LIMIT / ON_EXCEED](#99-limit--on_exceed)
- [10. Type System](#10-type-system)
  - [10.1 Primitive Types](#101-primitive-types)
  - [10.2 Collection Types](#102-collection-types)
  - [10.3 Named Types](#103-named-types)
  - [10.4 Optional Types](#104-optional-types)
- [11. Constraints](#11-constraints)
- [12. INVARIANTS Block](#12-invariants-block)
- [13. ERRORS Block](#13-errors-block)
- [14. DEPENDS Block](#14-depends-block)
- [15. Comments](#15-comments)
- [16. Lexical Rules](#16-lexical-rules)
- [17. Reserved Words](#17-reserved-words)
- [18. Formal Grammar Summary](#18-formal-grammar-summary)

---

## 1. Overview

CodeSpec is a deterministic behavioral specification language designed to bridge the gap between source code and human understanding. It provides a formal, human-readable representation of what a module does -- above the level of implementation detail, but precise enough to convert bidirectionally to and from programming languages.

A CodeSpec specification describes a module's:

- **Inputs and outputs** -- the data contract
- **State** -- what data the module reads and writes
- **Actions** -- the behavioral units (functions/methods), including control flow, error handling, retries, and events
- **Invariants** -- behavioral guarantees that must always (or must never) hold
- **Errors** -- named error types with optional HTTP status codes
- **Dependencies** -- external services the module relies on

CodeSpec files use the `.spec.md` extension. The CodeSpec language text is embedded inside fenced code blocks (` ```codespec `) within a markdown document, allowing surrounding prose, headings, and context alongside the formal specification.

## 2. Design Philosophy

### Zero AI at Runtime

The CodeSpec toolchain uses pure static analysis. No LLM, no API keys, no network calls. The output is 100% deterministic: the same source code always produces the exact same specification. This is fundamental to trust.

### The 5-Minute Rule

Any engineer should be able to read a `.spec.md` file and fully understand a module's behavior in under 5 minutes. The language is intentionally concise and reads like structured pseudocode.

### Bidirectional Conversion

CodeSpec is designed for round-trip fidelity:

```
Source Code  --(analyze)-->  CodeSpec AST  --(serialize)-->  .spec.md
.spec.md     --(parse)---->  CodeSpec AST  --(generate)--->  Source Code
```

The AST is the single source of truth. Every operation -- parse, serialize, analyze, generate, validate -- goes through the AST.

### Natural Language Invariants

INVARIANTS are natural language by design. They represent behavioral guarantees that are critical for human understanding but hard to express formally. They are authored by engineers, not generated from code. The validator checks structural consistency, not invariant correctness.

## 3. Document Structure

A `.spec.md` file is a standard markdown document containing one or more fenced code blocks tagged with the `codespec` language identifier:

```markdown
# My Module

Some description of what this module does.

` ` `codespec
MODULE MyModule {
  -- module contents here
}
` ` `
```

> Note: The triple backticks above are spaced for display purposes. In actual files, use standard fenced code block syntax with no spaces between the backticks.

The parser extracts all ` ```codespec ` blocks from the markdown and parses them independently. The surrounding markdown is a presentation concern and is not part of the CodeSpec language itself.

A single fenced block may contain one or more MODULE declarations, optionally preceded by top-level comments.

## 4. Module

The MODULE is the top-level container for a CodeSpec specification. Every spec consists of one or more modules.

### Syntax

```
MODULE <Name> {
  <member>*
}
```

- `<Name>` is an identifier (PascalCase by convention).
- `<member>` is any of: INPUT, OUTPUT, STATE, ACTION, INVARIANTS, ERRORS, DEPENDS, or a comment.
- Member blocks may appear in any order and at most once each, except ACTION which may appear multiple times.

### Example

```codespec
MODULE UserRegistration {
  INPUT { ... }
  OUTPUT { ... }
  STATE { ... }
  ACTION register(...) -> User { ... }
  ACTION deleteUser(...) -> Void { ... }
  INVARIANTS { ... }
  ERRORS { ... }
  DEPENDS { ... }
}
```

### Semantics

A module maps to a logical unit of behavior: a service, a controller, a class, or a collection of related functions. The module name should reflect the domain capability it provides.

## 5. INPUT Block

The INPUT block declares the data contract for input to the module.

### Syntax

```
INPUT {
  <field>+
}
```

Each field follows the form:

```
<name>: <Type> [<constraints>]?
```

- `<name>` is an identifier (camelCase by convention).
- `<Type>` is any valid type reference (see [Type System](#10-type-system)).
- `[<constraints>]` is an optional constraint block (see [Constraints](#11-constraints)).

### Example

```codespec
INPUT {
  email: Email [format:email]
  password: String [min:8, max:128]
  name: String [min:1, max:100]
  role: String [enum:("admin","user","guest")]
  nickname: String?
}
```

### Semantics

INPUT fields represent the parameters, request body, or configuration values that the module requires. They define what data must be provided by callers.

## 6. OUTPUT Block

The OUTPUT block declares the data contract for the module's output.

### Syntax

```
OUTPUT {
  <field>+
}
```

Fields use the same syntax as INPUT fields.

### Example

```codespec
OUTPUT {
  user: User
  token: String
  permissions: List<String>
}
```

### Semantics

OUTPUT fields represent the return value, response body, or result structure that the module produces. Named types (like `User`) refer to domain entities defined elsewhere.

## 7. STATE Block

The STATE block declares what data the module reads from and writes to persistent storage or shared state.

### Syntax

```
STATE {
  <state-field>+
}
```

Each state field follows the form:

```
<access> <name>: <Type>
```

- `<access>` is either `READS` or `WRITES`.
- `<name>` is an identifier for the state resource.
- `<Type>` is any valid type reference.

### Example

```codespec
STATE {
  READS users: List<User>
  READS config: Config
  WRITES users: List<User>
  WRITES sessions: List<Session>
  WRITES auditLog: List<AuditEntry>
}
```

### Semantics

- `READS` indicates the module queries or reads from this data source.
- `WRITES` indicates the module modifies or writes to this data source.

A resource may appear under both READS and WRITES if the module both reads from and writes to it. The state block makes data dependencies explicit, which is critical for understanding side effects and for validation.

## 8. ACTION Block

An ACTION is a behavioral unit that maps to a function, method, or endpoint. It is the core of a CodeSpec specification -- where behavior is described.

### Syntax

```
ACTION <name>(<parameters>) -> <ReturnType> {
  <statement>*
}
```

- `<name>` is an identifier (camelCase by convention).
- `<parameters>` is a comma-separated list of typed parameters (may be empty).
- `<ReturnType>` is any valid type reference.
- The body contains zero or more statements.

Each parameter follows the form:

```
<name>: <Type> [<constraints>]?
```

### Example

```codespec
ACTION register(email: Email, password: String [min:8], name: String) -> User {
  SET hashedPassword = CALL hashPassword(password)

  WHEN CALL userExists(email) {
    FAIL EmailAlreadyExists "A user with this email already exists"
  }

  SET user = CALL createUser(email, hashedPassword, name)
  EMIT UserRegistered { user }
  RETURN user
}
```

### Semantics

An ACTION describes the step-by-step behavioral flow of an operation. The body is read top-to-bottom: statements execute in declaration order. Branching is expressed through WHEN/OTHERWISE and MATCH. An action should represent a complete unit of behavior from input to output.

A module may contain multiple ACTION blocks, each describing a different operation the module supports.

## 9. Statements

Statements appear inside ACTION bodies (and inside WHEN, OTHERWISE, MATCH arms, ON_EXHAUST, and ON_EXCEED blocks). They describe the behavioral flow.

### 9.1 WHEN / OTHERWISE

Conditional guard. Executes a block of statements when a condition is true, with an optional fallback.

#### Syntax

```
WHEN <condition> {
  <statement>*
}
```

With optional fallback:

```
WHEN <condition> {
  <statement>*
} OTHERWISE {
  <statement>*
}
```

- `<condition>` is free-form text up to the opening `{`. It may include CALL expressions, comparisons, or any descriptive condition.

#### Example

```codespec
WHEN CALL userExists(email) {
  FAIL EmailAlreadyExists "A user with this email already exists"
}

WHEN age >= 18 {
  SET eligible = true
} OTHERWISE {
  FAIL Underage "Must be at least 18 years old"
}
```

#### Semantics

WHEN evaluates its condition. If true, the body executes. If false and an OTHERWISE clause is present, the OTHERWISE body executes. WHEN blocks may be nested.

### 9.2 MATCH

Pattern matching on a value. Dispatches to one of multiple arms based on the subject value.

#### Syntax

```
MATCH <subject> {
  <pattern> -> <statement>
  <pattern> -> {
    <statement>*
  }
}
```

- `<subject>` is free-form text up to the opening `{`. It is typically a variable name or a CALL expression.
- `<pattern>` is one of:
  - A string literal: `"admin"`
  - An identifier: `Active`
  - The wildcard: `_` (matches anything)
- Arms with a single statement may use the inline form (no braces).
- Arms with multiple statements must use the block form (with braces).

#### Example

```codespec
MATCH CALL getUserRole(userId) {
  "admin" -> FAIL CannotDeleteAdmin "Cannot delete admin users"
  "user" -> {
    CALL removeUser(userId)
    EMIT UserDeleted { userId }
  }
  _ -> FAIL UnknownRole "Unrecognized role"
}
```

#### Semantics

MATCH evaluates the subject and compares it against each arm's pattern in order. The first matching arm's body executes. The wildcard `_` matches any value and is typically used as the final arm.

### 9.3 SET

Variable assignment. Binds a name to a value for use in subsequent statements.

#### Syntax

```
SET <variable> = <expression>
```

- `<variable>` is an identifier.
- `<expression>` is either a CALL expression or free-form text (representing a value, computation, or reference).

#### Example

```codespec
SET hashedPassword = CALL hashPassword(password)
SET greeting = "Hello, " + name
SET count = items.length
```

#### Semantics

SET introduces or updates a local variable within the current action. The variable is available to all subsequent statements in the same scope. When the right-hand side is a CALL, it is recognized structurally (the call target and arguments are captured). Other expressions are captured as text.

### 9.4 CALL

Invokes a dependency or internal action.

#### Syntax

```
CALL <target>(<arguments>)
```

- `<target>` is an identifier naming the function or service method to invoke.
- `<arguments>` is a comma-separated list of arguments. Each argument is either a string literal or an identifier (which may include dot-notation).

#### Example

```codespec
CALL sendVerificationEmail(user.email, token)
CALL removeUser(userId)
CALL notifyAdmin("User deleted", userId)
```

#### Semantics

CALL as a standalone statement invokes a side-effecting operation whose return value is not captured. To capture the return value, use SET:

```codespec
SET result = CALL doSomething(arg1, arg2)
```

CALL also appears inside WHEN conditions, MATCH subjects, SET right-hand sides, and RETRY blocks.

### 9.5 RETURN

Returns a value from an action, ending its execution.

#### Syntax

```
RETURN <value>
```

- `<value>` is free-form text until end of line or closing `}`.

#### Example

```codespec
RETURN user
RETURN void
RETURN { user, token }
```

#### Semantics

RETURN ends the current action and produces the given value as the action's result. The value `void` is used for actions with return type `Void`. An action should have at least one RETURN statement on every code path (or end with a FAIL).

### 9.6 FAIL

Raises a named error, terminating the action with an error condition.

#### Syntax

```
FAIL <ErrorName>
FAIL <ErrorName> <"message">
```

- `<ErrorName>` is an identifier (PascalCase by convention) matching a name declared in the ERRORS block.
- `<"message">` is an optional string literal providing a human-readable error message.

#### Example

```codespec
FAIL EmailAlreadyExists "A user with this email already exists"
FAIL NotFound
FAIL Unauthorized "Invalid credentials"
```

#### Semantics

FAIL raises an error identified by name. The error name should correspond to an entry in the module's ERRORS block. The optional message provides additional context. In generated code, FAIL maps to `throw`, exception raising, or error return depending on the target language.

### 9.7 EMIT

Fires a domain event, signaling that something noteworthy has occurred.

#### Syntax

```
EMIT <EventName>
EMIT <EventName> { <payload> }
```

- `<EventName>` is an identifier (PascalCase by convention).
- `{ <payload> }` is optional. The payload is free-form text between the braces.

#### Example

```codespec
EMIT UserRegistered { user }
EMIT PasswordChanged { userId, timestamp }
EMIT SystemStarted
```

#### Semantics

EMIT fires a domain event. Events are informational: they signal that something has happened but do not alter control flow. In generated code, EMIT maps to event bus publishing, observer notification, or webhook dispatch. The payload describes what data is attached to the event.

### 9.8 RETRY / ON_EXHAUST

Retry logic with a fallback when all attempts are exhausted.

#### Syntax

```
RETRY CALL <target>(<arguments>) <N> TIMES [DELAY <"duration">] {
  ON_EXHAUST {
    <statement>*
  }
}
```

- `<target>` and `<arguments>` follow the same rules as CALL.
- `<N>` is an integer literal for the number of retry attempts.
- `DELAY <"duration">` is optional. The duration is a string literal (e.g., `"1s"`, `"500ms"`, `"2m"`).
- The ON_EXHAUST block contains statements to execute when all retries have failed.

#### Example

```codespec
RETRY CALL findUser(userId) 3 TIMES DELAY "1s" {
  ON_EXHAUST {
    FAIL UserNotFound "User not found after retries"
  }
}

RETRY CALL sendEmail(to, subject, body) 5 TIMES DELAY "2s" {
  ON_EXHAUST {
    EMIT EmailDeliveryFailed { to, subject }
    CALL logFailure(to, subject)
  }
}
```

#### Semantics

RETRY attempts the CALL up to N times. If the call succeeds on any attempt, execution continues past the RETRY block. If all N attempts fail, the ON_EXHAUST block executes. The optional DELAY specifies the wait time between retry attempts.

### 9.9 LIMIT / ON_EXCEED

Rate limiting declaration with a fallback when the limit is exceeded.

#### Syntax

```
LIMIT <rate> PER <period> {
  ON_EXCEED {
    <statement>*
  }
}
```

- `<rate>` is a value (typically a number or identifier).
- `<period>` is a value (typically a quoted duration like `"minute"` or an identifier).
- The ON_EXCEED block contains statements to execute when the rate limit is exceeded.

#### Example

```codespec
LIMIT 100 PER "minute" {
  ON_EXCEED {
    FAIL RateLimited "Too many requests, please try again later"
  }
}

LIMIT 5 PER "hour" {
  ON_EXCEED {
    EMIT RateLimitExceeded { userId }
    FAIL TooManyAttempts "Maximum attempts exceeded"
  }
}
```

#### Semantics

LIMIT declares that the surrounding action (or the operations within its scope) should be rate-limited to the given rate per time period. When the limit is exceeded, the ON_EXCEED block executes instead of the normal flow.

## 10. Type System

CodeSpec has a small, fixed type system designed for clarity and interoperability across target languages.

### 10.1 Primitive Types

| Type       | Description                                    |
|------------|------------------------------------------------|
| `String`   | UTF-8 text                                     |
| `Int`      | Integer number (no decimal)                    |
| `Float`    | Floating-point number                          |
| `Bool`     | Boolean (`true` / `false`)                     |
| `DateTime` | Date and time value (ISO 8601)                 |
| `Email`    | Email address (semantic subtype of String)     |
| `Hash`     | Hashed/opaque string (semantic subtype)        |
| `UUID`     | Universally unique identifier                  |
| `Void`     | No value (used for actions with no return)     |

`Email`, `Hash`, and `UUID` are semantic subtypes of `String`. They carry additional meaning about the nature of the data and may trigger specialized validation in generated code.

### 10.2 Collection Types

#### List

An ordered collection of elements of a single type.

```
List<T>
```

Examples: `List<String>`, `List<User>`, `List<List<Int>>`

#### Map

A key-value mapping from one type to another.

```
Map<K, V>
```

Examples: `Map<String, Int>`, `Map<UUID, User>`, `Map<String, List<String>>`

Collection types may be nested: `List<Map<String, Int>>` and `Map<String, List<User>>` are valid.

### 10.3 Named Types

Any identifier that is not a reserved word or primitive type name is treated as a named type reference. Named types refer to domain entities, DTOs, or types defined in other modules or external systems.

```
User
Session
Config
AuditEntry
PaymentResult
```

Named types are written in PascalCase by convention. The CodeSpec language does not define their structure -- they are opaque references resolved by the analyzer or generator.

### 10.4 Optional Types

Any type can be made optional by appending `?`:

```
String?
User?
List<String>?
Map<String, Int>?
```

An optional type indicates that the value may be absent (null/undefined/nil depending on target language).

## 11. Constraints

Constraints restrict the allowed values for a field or parameter. They appear in square brackets after the type.

### Syntax

```
[<constraint>, <constraint>, ...]
```

### Supported Constraints

| Constraint  | Syntax                           | Description                                  |
|-------------|----------------------------------|----------------------------------------------|
| `min`       | `min:<number>`                   | Minimum value (for numbers) or length (for strings) |
| `max`       | `max:<number>`                   | Maximum value (for numbers) or length (for strings) |
| `pattern`   | `pattern:<"regex">`              | Regular expression the value must match       |
| `format`    | `format:<name>`                  | Named format (e.g., `email`, `url`, `iso8601`) |
| `enum`      | `enum:(<"val1">,<"val2">,...)` | Allowed values (exhaustive list)              |

### Examples

```codespec
email: Email [format:email]
password: String [min:8, max:128]
name: String [min:1, max:100]
role: String [enum:("admin","user","guest")]
code: String [pattern:"^[A-Z]{3}$"]
score: Float [min:0, max:100.0]
```

### Semantics

Constraints are declarative. They describe what values are valid, not how validation is implemented. The generator uses constraints to produce validation logic in the target language. The analyzer extracts constraints from source code validation patterns.

Numbers in constraints may be integers or floating-point values. Pattern values are regular expressions in string literals. Format names are unquoted identifiers. Enum values are comma-separated string literals enclosed in parentheses.

## 12. INVARIANTS Block

The INVARIANTS block declares behavioral guarantees using natural language. These are the promises a module makes about its behavior.

### Syntax

```
INVARIANTS {
  ALWAYS <"description">
  NEVER <"description">
}
```

- `ALWAYS` declares something that must always be true.
- `NEVER` declares something that must never happen.
- `<"description">` is a string literal containing the invariant in natural language.

### Example

```codespec
INVARIANTS {
  ALWAYS "Passwords are stored as hashed values, never plaintext"
  ALWAYS "All database writes are wrapped in a transaction"
  ALWAYS "Rate limiting is applied before any business logic"
  NEVER "User email is shared with third parties without consent"
  NEVER "API keys are logged or included in error messages"
}
```

### Semantics

Invariants are natural language by design. They capture behavioral guarantees that are essential for human understanding but difficult to express formally. They are authored manually by engineers -- the analyzer cannot auto-generate them from code.

The validator checks for structural consistency (are invariants present? do they follow the syntax?) but does not verify the semantic truth of invariant descriptions.

## 13. ERRORS Block

The ERRORS block defines named error types that the module may produce.

### Syntax

```
ERRORS {
  <ErrorName> [<status>] [<"message">]
}
```

- `<ErrorName>` is an identifier (PascalCase by convention).
- `<status>` is an optional integer literal (typically an HTTP status code).
- `<"message">` is an optional string literal with a default error message.

All three forms are valid:

```
ErrorName
ErrorName 404
ErrorName 404 "Not found"
ErrorName "Not found"
```

### Example

```codespec
ERRORS {
  EmailAlreadyExists 409 "A user with this email already exists"
  UserNotFound 404 "The requested user was not found"
  CannotDeleteAdmin 403 "Cannot delete admin users"
  Unauthorized 401 "Invalid credentials"
  RateLimited 429 "Too many requests"
  InternalError 500
  ValidationFailed
}
```

### Semantics

Error names declared here are referenced by FAIL statements in ACTION bodies. The status code maps to HTTP status codes in web contexts but is meaningful in any context as a severity/category indicator. The message provides a default human-readable description. In generated code, each error maps to an exception class, error type, or error constant.

## 14. DEPENDS Block

The DEPENDS block declares external services or systems that the module depends on.

### Syntax

```
DEPENDS {
  <ServiceName> [<"description">]
}
```

- `<ServiceName>` is an identifier (PascalCase by convention).
- `<"description">` is an optional string literal explaining the dependency.

### Example

```codespec
DEPENDS {
  HashService "Password hashing and verification"
  EmailService "Sending verification and notification emails"
  Database "User persistence layer"
  PaymentGateway "External payment processing via Stripe"
  Cache "Redis-based session and data caching"
}
```

### Semantics

Dependencies make external coupling explicit. They document what services or systems the module calls at runtime. In generated code, dependencies map to injected services, imported modules, or client configurations. The description is for human readers.

## 15. Comments

Comments begin with `--` and extend to the end of the line.

### Syntax

```
-- This is a comment
```

### Placement

Comments may appear:

- At the top level (before or between modules)
- Inside a module (between member blocks)
- Inside an action body (between statements)

### Example

```codespec
-- User management module
MODULE UserManagement {
  -- Input validation rules
  INPUT {
    email: Email [format:email]
    password: String [min:8, max:128]
  }

  ACTION register(email: Email, password: String) -> User {
    -- Hash the password before storing
    SET hashedPassword = CALL hashPassword(password)

    -- Check for duplicate email
    WHEN CALL userExists(email) {
      FAIL EmailAlreadyExists
    }

    RETURN user
  }
}
```

### Semantics

Comments are preserved in the AST for round-trip fidelity. When a spec is parsed and re-serialized, comments appear in the same positions. Comments are for human readers and have no effect on behavior.

## 16. Lexical Rules

### Identifiers

An identifier starts with a letter or underscore, followed by zero or more letters, digits, or underscores:

```
[a-zA-Z_][a-zA-Z0-9_]*
```

Examples: `email`, `hashedPassword`, `UserRegistration`, `find_by_id`

### String Literals

String literals are enclosed in double quotes. Backslashes and double quotes within the string are escaped with a backslash:

```
"Hello, world"
"A user with this email already exists"
"^[A-Z]{3}$"
"escaped \"quotes\" and \\backslashes"
```

### Integer Literals

One or more digits:

```
0
42
404
```

### Number Literals

Integers or floating-point numbers:

```
42
3.14
0.5
100.0
```

### Whitespace

- Spaces, tabs, newlines, and carriage returns are optional whitespace.
- At least one whitespace character is required between keywords and identifiers (e.g., `MODULE Name`, not `MODULEName`).
- Inside certain constructs (e.g., error definitions), only horizontal whitespace (spaces and tabs, not newlines) is permitted between elements on the same line.

## 17. Reserved Words

The following words are reserved and cannot be used as named type references or identifiers in type positions:

**Keywords:**
`MODULE`, `INPUT`, `OUTPUT`, `STATE`, `ACTION`, `WHEN`, `OTHERWISE`, `MATCH`, `SET`, `CALL`, `RETURN`, `FAIL`, `EMIT`, `RETRY`, `ON_EXHAUST`, `LIMIT`, `ON_EXCEED`, `PER`, `INVARIANTS`, `ERRORS`, `DEPENDS`, `ALWAYS`, `NEVER`, `READS`, `WRITES`, `TIMES`, `DELAY`

**Type names:**
`String`, `Int`, `Float`, `Bool`, `DateTime`, `Email`, `Hash`, `UUID`, `Void`, `List`, `Map`

Reserved word matching is whole-word only. For example, `INPUTStream` is a valid named type, but `INPUT` alone is reserved. This is enforced by requiring that a reserved word is not followed by an identifier character (`[a-zA-Z0-9_]`).

## 18. Formal Grammar Summary

This section provides a high-level summary of the CodeSpec grammar structure. For the complete formal grammar in EBNF notation, see [grammar.md](grammar.md).

```
SpecFile       = (Module | Comment)*
Module         = "MODULE" Identifier "{" ModuleMember* "}"
ModuleMember   = InputBlock | OutputBlock | StateBlock | ActionBlock
               | InvariantsBlock | ErrorsBlock | DependsBlock | Comment

InputBlock     = "INPUT" "{" Field+ "}"
OutputBlock    = "OUTPUT" "{" Field+ "}"
Field          = Identifier ":" TypeReference Constraints?

StateBlock     = "STATE" "{" StateField+ "}"
StateField     = ("READS" | "WRITES") Identifier ":" TypeReference

ActionBlock    = "ACTION" Identifier "(" ParameterList ")" "->" TypeReference "{" Statement* "}"
ParameterList  = (Parameter ("," Parameter)*)?
Parameter      = Identifier ":" TypeReference Constraints?

Statement      = WhenStatement | MatchStatement | SetStatement | CallStatement
               | ReturnStatement | FailStatement | EmitStatement
               | RetryStatement | LimitStatement | Comment

TypeReference  = BaseType "?"?
BaseType       = PrimitiveType | "List" "<" TypeReference ">"
               | "Map" "<" TypeReference "," TypeReference ">" | NamedType

Constraints    = "[" Constraint ("," Constraint)* "]"
Constraint     = "min" ":" Number | "max" ":" Number | "pattern" ":" String
               | "format" ":" Identifier | "enum" ":" "(" String ("," String)* ")"

InvariantsBlock = "INVARIANTS" "{" InvariantRule+ "}"
InvariantRule   = ("ALWAYS" | "NEVER") String

ErrorsBlock    = "ERRORS" "{" ErrorDef+ "}"
ErrorDef       = Identifier Integer? String?

DependsBlock   = "DEPENDS" "{" DependencyDef+ "}"
DependencyDef  = Identifier String?

Comment        = "--" <text-to-end-of-line>
```

This summary uses simplified notation. The actual grammar handles whitespace, operator precedence, and ambiguity resolution through PEG ordered choice. See [grammar.md](grammar.md) for the complete specification.
