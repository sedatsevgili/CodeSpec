# CodeSpec

## Project Vision

CodeSpec is a deterministic behavioral specification language and CLI tool that bridges the gap between AI-generated code and human understanding. It provides a formal, human-readable representation of what code does — above the level of implementation, but deterministic enough to convert bidirectionally to/from programming languages.

**Core premise:** As AI-generated code grows, engineers need a higher-level abstraction to quickly understand, review, and govern modules without reading every line. CodeSpec is that abstraction.

**Zero AI at runtime:** The tool itself uses pure static analysis. No LLM, no API keys, no network. Fully deterministic — same code in, same spec out, every time.

**The 5-minute rule:** Any engineer should be able to read a `.spec.md` file and fully understand a module's behavior in under 5 minutes.

## Architecture

```
Source Code (TS/JS/PHP)
        ↓ analyze (static analysis, deterministic)
   CodeSpec AST
        ↓ serialize
   .spec.md file (human-readable, fenced codespec blocks inside markdown)
        ↓ parse
   CodeSpec AST
        ↓ generate (deterministic)
Source Code (TS/JS/PHP)
```

### Key Components

- **Parser** — Parses CodeSpec language (from `.spec.md` fenced blocks) into AST. Built with Peggy (PEG parser generator).
- **Analyzer** — Reads source code (TS/JS/PHP) and produces a CodeSpec AST using pure static analysis. No AI, no API calls, fully deterministic.
- **Generator** — Takes a CodeSpec AST and produces source code in the target language. Fully deterministic, no AI involved.
- **Serializer** — Converts AST to human-readable CodeSpec language text, wrapped in markdown.
- **Validator** — Compares a `.spec.md` against its corresponding source code to detect drift.
- **CLI** — The user-facing interface that orchestrates all of the above.

### Directory Structure

```
codespec/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── analyze.ts        # code → spec
│   │   │   ├── generate.ts       # spec → code
│   │   │   ├── validate.ts       # spec ↔ code consistency check
│   │   │   └── diff.ts           # behavioral diff between spec versions
│   │   └── index.ts              # CLI setup (commander)
│   ├── parser/
│   │   ├── grammar.peggy         # PEG grammar for CodeSpec language
│   │   ├── parser.ts             # Parser wrapper
│   │   └── index.ts
│   ├── ast/
│   │   ├── nodes.ts              # AST node type definitions
│   │   ├── builder.ts            # Helpers for constructing AST nodes
│   │   ├── visitor.ts            # AST visitor/walker pattern
│   │   └── index.ts
│   ├── analyzer/
│   │   ├── index.ts              # Main analyzer orchestrator
│   │   ├── typescript.ts         # TS/JS static analysis (ts-morph)
│   │   ├── php.ts                # PHP static analysis (php-parser)
│   │   └── merge.ts              # Merges multi-language analysis into AST
│   ├── generator/
│   │   ├── index.ts              # Generator orchestrator
│   │   ├── typescript.ts         # AST → TypeScript code
│   │   ├── javascript.ts         # AST → JavaScript code
│   │   └── php.ts                # AST → PHP code
│   ├── serializer/
│   │   ├── index.ts              # AST → CodeSpec text
│   │   └── markdown.ts           # Wraps CodeSpec text in .spec.md format
│   ├── validator/
│   │   ├── index.ts              # Spec ↔ code consistency checker
│   │   └── drift.ts              # Detects behavioral drift
│   └── utils/
│       ├── config.ts             # Configuration loading (.codespecrc)
│       ├── files.ts              # File discovery and I/O
│       └── logger.ts             # Logging utility
├── tests/
│   ├── parser/                   # Grammar and parsing tests
│   ├── analyzer/                 # Analysis tests per language
│   ├── generator/                # Code generation tests (snapshot-based)
│   ├── serializer/               # Serialization round-trip tests
│   ├── validator/                # Validation tests
│   └── fixtures/                 # Sample source files and expected specs
│       ├── typescript/
│       ├── javascript/
│       └── php/
└── docs/
    ├── language-spec.md          # Full CodeSpec language specification
    ├── grammar.md                # Grammar reference (EBNF)
    └── examples/                 # Example .spec.md files
```

## Tech Stack

- **Runtime:** Node.js (>=20)
- **Language:** TypeScript (strict mode)
- **CLI framework:** Commander.js
- **Parser generator:** Peggy (PEG.js successor) for CodeSpec grammar
- **TS/JS analysis:** ts-morph (TypeScript compiler API wrapper)
- **PHP analysis:** php-parser (Glayzzle) for PHP AST extraction
- **Testing:** Vitest
- **Build:** tsup (fast TS bundler)
- **Linting:** ESLint with TypeScript preset
- **Formatting:** Prettier

## CodeSpec Language Reference

### Top-Level Structure

Every spec is a MODULE containing typed blocks:

```codespec
MODULE ModuleName {
  INPUT { ... }
  OUTPUT { ... }
  STATE { ... }
  ACTION name(params) -> ReturnType { ... }
  INVARIANTS { ... }
  ERRORS { ... }
  DEPENDS { ... }
}
```

### Keywords (all UPPERCASE)

- `MODULE` — Top-level container
- `INPUT` / `OUTPUT` — Interface declarations with types and constraints
- `STATE` — Declares what data the module `READS` and `WRITES`
- `ACTION` — A behavioral unit (maps to a function/method)
- `WHEN` / `OTHERWISE` — Conditional guards
- `MATCH` — Pattern matching on values
- `SET` — Variable assignment
- `CALL` — Invokes a dependency or internal action
- `RETURN` — Returns a value from an action
- `FAIL` — Raises a named error
- `EMIT` — Fires a domain event
- `RETRY` / `ON_EXHAUST` — Retry logic with fallback
- `LIMIT` — Rate limiting declaration
- `INVARIANTS` — `ALWAYS` / `NEVER` behavioral guarantees
- `ERRORS` — Named error types with HTTP status codes
- `DEPENDS` — External service dependencies

### Primitive Types

`String`, `Int`, `Float`, `Bool`, `DateTime`, `Email`, `Hash`, `UUID`, `Void`

### Collection Types

`List<T>`, `Map<K, V>`

### Constraints

`[min:N, max:N, pattern:"regex", format:name, enum:("a","b","c")]`

### Comments

`-- This is a comment`

## CLI Commands

```bash
# Analyze source code and generate spec
codespec analyze <file-or-dir> [--lang ts|js|php] [--out <dir>]

# Generate source code from spec
codespec generate <spec-file> [--target ts|js|php] [--out <dir>]

# Validate spec matches source code
codespec validate <spec-file> [--source <file>]

# Show behavioral diff between two spec versions
codespec diff <old-spec> <new-spec>
```

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Build with tsup
npm run dev          # Watch mode
npm run test         # Run tests with Vitest
npm run lint         # ESLint
npm run format       # Prettier
npm run parse:test   # Test grammar against fixtures
```

## Configuration

Optional `.codespecrc.json` in project root:

```json
{
  "languages": ["typescript", "javascript", "php"],
  "output_dir": "./specs",
  "analyze": {
    "include": ["src/**/*"],
    "exclude": ["**/*.test.*", "**/*.spec.*", "**/node_modules/**"]
  },
  "generate": {
    "style": "functional",
    "target_dir": "./generated"
  }
}
```

## Development Priorities

### Phase 1: Parser & Core (MVP)
1. Define Peggy grammar for CodeSpec language
2. Implement AST node types
3. Build parser (CodeSpec text → AST)
4. Build serializer (AST → CodeSpec text)
5. Verify round-trip: parse → serialize → parse produces identical AST
6. CLI skeleton with `analyze` command (stubbed)

### Phase 2: Analyzer (Code → Spec)
1. TypeScript analyzer using ts-morph (extract functions, types, control flow, state)
2. Map source language constructs to CodeSpec AST nodes (if/else → WHEN, switch → MATCH, throw → FAIL, try/catch → RETRY, event emit → EMIT)
3. Detect dependencies from imports and external calls → DEPENDS
4. Detect state reads/writes from database/store calls → STATE
5. JavaScript analyzer (reuse TS analyzer with JS config)
6. PHP analyzer using php-parser

### Phase 3: Generator (Spec → Code)
1. TypeScript generator (AST → .ts files)
2. JavaScript generator (AST → .js files)
3. PHP generator (AST → .php files)
4. Snapshot tests for all generators

### Phase 4: Validation & Diff
1. Validator: compare spec AST against source code AST, report drift
2. Diff: structural comparison of two spec ASTs, output behavioral changes

## Code Style & Conventions

- Strict TypeScript: `noImplicitAny`, `strictNullChecks`
- Functional approach where possible, classes for AST visitors
- All AST nodes are immutable (readonly properties)
- Every public function has JSDoc with at least a one-line description
- Test files live next to source: `parser.ts` → `parser.test.ts` (in tests/ mirror)
- Snapshot tests for generator output
- Error messages should be human-friendly and actionable
- No `any` types — use `unknown` and narrow

## Key Design Decisions

- **Peggy over hand-written parser:** Faster iteration on grammar, built-in error reporting, generates reliable parsers.
- **AST is the single source of truth:** Every operation (parse, serialize, analyze, generate, validate) goes through the AST. No shortcuts.
- **Zero AI dependency at runtime.** This tool uses pure static analysis. No LLM calls, no API keys, no network required. The output is 100% deterministic — run it twice on the same code, get the exact same spec. This is fundamental to trust.
- **LLM is used ONLY to build this tool (via Claude Code), never inside it.** The generator (spec → code) and the analyzer (code → spec) are both fully deterministic.
- **Markdown wrapping is a presentation concern.** The parser extracts codespec blocks from markdown. The serializer wraps output in markdown. The core language knows nothing about markdown.
- **INVARIANTS are natural language by design.** They represent behavioral guarantees that are hard to express formally but critical for human understanding. The analyzer cannot auto-generate these from code — they are added manually by engineers. The validator checks structural consistency, not invariant correctness.

## Important Notes for Claude

- When working on the grammar (`grammar.peggy`), always run round-trip tests after changes.
- When adding new AST node types, update: `nodes.ts`, `builder.ts`, `visitor.ts`, `serializer/index.ts`, and all generators.
- The analyzer must be deterministic: same input code must always produce the same AST. No randomness, no external calls.
- Generated code should include a header comment: `// Generated by CodeSpec — do not edit manually`
- Keep the CLI output clean and scannable. Use color sparingly. Show progress for long operations.
- When in doubt about language design decisions, refer to `docs/language-spec.md` as the canonical reference.