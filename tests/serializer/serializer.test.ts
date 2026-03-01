import { describe, it, expect } from "vitest";
import * as peggy from "peggy";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  serializeSpecFile,
  serializeModule,
  serializeType,
  serializeConstraints,
} from "../../src/serializer/index.js";
import {
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
} from "../../src/ast/index.js";
import type { SpecFile } from "../../src/ast/index.js";

// Build a fresh parser from the grammar for round-trip tests
const grammarSource = readFileSync(
  resolve(__dirname, "../../src/parser/grammar.peggy"),
  "utf-8",
);

function buildParser() {
  return peggy.generate(grammarSource);
}

function parse(text: string): SpecFile {
  return buildParser().parse(text) as SpecFile;
}

// ---------------------------------------------------------------------------
// Type serialization
// ---------------------------------------------------------------------------

describe("serializeType", () => {
  it("should serialize primitive types", () => {
    expect(serializeType(primitiveType("String"))).toBe("String");
    expect(serializeType(primitiveType("Int"))).toBe("Int");
    expect(serializeType(primitiveType("Float"))).toBe("Float");
    expect(serializeType(primitiveType("Bool"))).toBe("Bool");
    expect(serializeType(primitiveType("DateTime"))).toBe("DateTime");
    expect(serializeType(primitiveType("Email"))).toBe("Email");
    expect(serializeType(primitiveType("Hash"))).toBe("Hash");
    expect(serializeType(primitiveType("UUID"))).toBe("UUID");
    expect(serializeType(primitiveType("Void"))).toBe("Void");
  });

  it("should serialize List<T>", () => {
    expect(serializeType(listType(primitiveType("String")))).toBe(
      "List<String>",
    );
  });

  it("should serialize Map<K, V>", () => {
    expect(
      serializeType(mapType(primitiveType("String"), primitiveType("Int"))),
    ).toBe("Map<String, Int>");
  });

  it("should serialize named types", () => {
    expect(serializeType(namedType("User"))).toBe("User");
  });

  it("should serialize optional types with ?", () => {
    expect(serializeType(optionalType(primitiveType("String")))).toBe(
      "String?",
    );
  });

  it("should serialize nested collection types", () => {
    expect(
      serializeType(listType(listType(primitiveType("String")))),
    ).toBe("List<List<String>>");
    expect(
      serializeType(
        mapType(primitiveType("String"), listType(primitiveType("Int"))),
      ),
    ).toBe("Map<String, List<Int>>");
  });

  it("should serialize optional collection types", () => {
    expect(
      serializeType(optionalType(listType(primitiveType("String")))),
    ).toBe("List<String>?");
  });
});

// ---------------------------------------------------------------------------
// Constraints serialization
// ---------------------------------------------------------------------------

describe("serializeConstraints", () => {
  it("should serialize min/max constraints", () => {
    expect(serializeConstraints(constraints({ min: 1, max: 100 }))).toBe(
      "[min:1, max:100]",
    );
  });

  it("should serialize format constraint", () => {
    expect(serializeConstraints(constraints({ format: "email" }))).toBe(
      "[format:email]",
    );
  });

  it("should serialize pattern constraint", () => {
    expect(
      serializeConstraints(constraints({ pattern: "^[A-Z]{3}$" })),
    ).toBe('[pattern:"^[A-Z]{3}$"]');
  });

  it("should serialize enum constraint", () => {
    expect(
      serializeConstraints(
        constraints({ enum: ["admin", "user", "guest"] }),
      ),
    ).toBe('[enum:("admin","user","guest")]');
  });

  it("should serialize mixed constraints", () => {
    expect(
      serializeConstraints(constraints({ min: 8, max: 128 })),
    ).toBe("[min:8, max:128]");
  });
});

// ---------------------------------------------------------------------------
// Module serialization
// ---------------------------------------------------------------------------

describe("serializeModule", () => {
  it("should serialize a minimal empty module", () => {
    const mod = module({ name: "Minimal", members: [] });
    const text = serializeModule(mod);
    expect(text).toBe("MODULE Minimal {\n}");
  });

  it("should serialize a module with INPUT block", () => {
    const mod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({
              name: "email",
              fieldType: primitiveType("Email"),
              constraints: constraints({ format: "email" }),
            }),
            field({
              name: "password",
              fieldType: primitiveType("String"),
              constraints: constraints({ min: 8, max: 128 }),
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("INPUT {");
    expect(text).toContain("  email: Email [format:email]");
    expect(text).toContain("  password: String [min:8, max:128]");
  });

  it("should serialize a module with OUTPUT block", () => {
    const mod = module({
      name: "Test",
      members: [
        output({
          fields: [
            field({ name: "user", fieldType: namedType("User") }),
            field({ name: "token", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("OUTPUT {");
    expect(text).toContain("    user: User");
    expect(text).toContain("    token: String");
  });

  it("should serialize a module with STATE block", () => {
    const mod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({
              access: "READS",
              name: "users",
              fieldType: listType(namedType("User")),
            }),
            stateField({
              access: "WRITES",
              name: "sessions",
              fieldType: listType(namedType("Session")),
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("STATE {");
    expect(text).toContain("    READS users: List<User>");
    expect(text).toContain("    WRITES sessions: List<Session>");
  });

  it("should serialize a module with ACTION block", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "doSomething",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
            parameter({ name: "name", paramType: primitiveType("String") }),
          ],
          returnType: namedType("User"),
          body: [
            set({ variable: "result", value: 'CALL doWork(email, name)' }),
            returnNode({ value: "result" }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("ACTION doSomething(email: Email, name: String) -> User {");
    expect(text).toContain("SET result = CALL doWork(email, name)");
    expect(text).toContain("RETURN result");
  });

  it("should serialize WHEN / OTHERWISE statements", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "check",
          params: [
            parameter({ name: "x", paramType: primitiveType("Int") }),
          ],
          returnType: primitiveType("String"),
          body: [
            when({
              condition: "x > 0",
              body: [returnNode({ value: "positive" })],
              otherwise: [returnNode({ value: "non_positive" })],
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("WHEN x > 0 {");
    expect(text).toContain("RETURN positive");
    expect(text).toContain("} OTHERWISE {");
    expect(text).toContain("RETURN non_positive");
  });

  it("should serialize MATCH statements", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "route",
          params: [
            parameter({ name: "role", paramType: primitiveType("String") }),
          ],
          returnType: primitiveType("Void"),
          body: [
            match({
              subject: "role",
              arms: [
                matchArm({
                  pattern: "admin",
                  body: [
                    fail({
                      error: "CannotDelete",
                      message: "Cannot delete admin",
                    }),
                  ],
                }),
                matchArm({
                  pattern: "user",
                  body: [
                    call({ target: "remove", args: ["role"] }),
                    emit({ event: "Removed", payload: "role" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("MATCH role {");
    // Identifier-like patterns are serialized without quotes (both forms
    // parse to the same AST, so round-trip fidelity is preserved)
    expect(text).toContain('admin -> FAIL CannotDelete "Cannot delete admin"');
    expect(text).toContain("user -> {");
    expect(text).toContain("CALL remove(role)");
    expect(text).toContain("EMIT Removed { role }");
  });

  it("should serialize EMIT statements with and without payload", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "doIt",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            emit({ event: "Created" }),
            emit({ event: "Updated", payload: "data" }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("EMIT Created");
    expect(text).toContain("EMIT Updated { data }");
  });

  it("should serialize FAIL statements with and without message", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "doIt",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            fail({ error: "NotFound" }),
            fail({ error: "BadRequest", message: "Invalid input" }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("FAIL NotFound");
    expect(text).toContain('FAIL BadRequest "Invalid input"');
  });

  it("should serialize RETRY with ON_EXHAUST", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "find",
          params: [
            parameter({ name: "id", paramType: primitiveType("UUID") }),
          ],
          returnType: primitiveType("Void"),
          body: [
            retry({
              target: "findUser",
              attempts: 3,
              delay: "1s",
              onExhaust: [
                fail({
                  error: "UserNotFound",
                  message: "User not found after retries",
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain('RETRY CALL findUser() 3 TIMES DELAY "1s" {');
    expect(text).toContain("ON_EXHAUST {");
    expect(text).toContain('FAIL UserNotFound "User not found after retries"');
  });

  it("should serialize LIMIT with ON_EXCEED", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "api",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            limit({
              rate: "100",
              per: '"minute"',
              onExceed: [
                fail({ error: "RateLimited", message: "Too many requests" }),
              ],
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain('LIMIT 100 PER "minute" {');
    expect(text).toContain("ON_EXCEED {");
    expect(text).toContain('FAIL RateLimited "Too many requests"');
  });

  it("should serialize INVARIANTS block", () => {
    const mod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({
              kind: "ALWAYS",
              description:
                "Passwords are stored as hashed values, never plaintext",
            }),
            invariantRule({
              kind: "NEVER",
              description:
                "User email is shared with third parties without consent",
            }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("INVARIANTS {");
    expect(text).toContain(
      'ALWAYS "Passwords are stored as hashed values, never plaintext"',
    );
    expect(text).toContain(
      'NEVER "User email is shared with third parties without consent"',
    );
  });

  it("should serialize ERRORS block", () => {
    const mod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({
              name: "NotFound",
              status: 404,
              message: "Not found",
            }),
            errorDef({ name: "Forbidden", status: 403 }),
            errorDef({ name: "Unknown" }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("ERRORS {");
    expect(text).toContain('NotFound 404 "Not found"');
    expect(text).toContain("Forbidden 403");
    expect(text).toContain("Unknown");
  });

  it("should serialize DEPENDS block", () => {
    const mod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({
              name: "Database",
              description: "User persistence layer",
            }),
            dependencyDef({ name: "Cache" }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("DEPENDS {");
    expect(text).toContain('Database "User persistence layer"');
    expect(text).toContain("Cache");
  });

  it("should serialize comments", () => {
    const mod = module({
      name: "Test",
      members: [
        comment({ text: "This is a comment" }),
        input({
          fields: [
            field({ name: "name", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const text = serializeModule(mod);
    expect(text).toContain("-- This is a comment");
  });

  it("should preserve member ordering", () => {
    const mod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [dependencyDef({ name: "DB" })],
        }),
        input({
          fields: [
            field({ name: "x", fieldType: primitiveType("Int") }),
          ],
        }),
        errors({
          errors: [errorDef({ name: "Err" })],
        }),
      ],
    });
    const text = serializeModule(mod);
    const dependsIdx = text.indexOf("DEPENDS");
    const inputIdx = text.indexOf("INPUT");
    const errorsIdx = text.indexOf("ERRORS");
    expect(dependsIdx).toBeLessThan(inputIdx);
    expect(inputIdx).toBeLessThan(errorsIdx);
  });
});

// ---------------------------------------------------------------------------
// SpecFile serialization
// ---------------------------------------------------------------------------

describe("serializeSpecFile", () => {
  it("should serialize a spec file with a single module", () => {
    const sf = specFile({
      modules: [module({ name: "Test", members: [] })],
    });
    const text = serializeSpecFile(sf);
    expect(text).toContain("MODULE Test {");
    expect(text).toContain("}");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("should serialize top-level comments before modules", () => {
    const sf = specFile({
      modules: [module({ name: "Test", members: [] })],
      comments: [comment({ text: "Top level" })],
    });
    const text = serializeSpecFile(sf);
    const commentIdx = text.indexOf("-- Top level");
    const moduleIdx = text.indexOf("MODULE");
    expect(commentIdx).toBeLessThan(moduleIdx);
  });

  it("should separate multiple modules with blank lines", () => {
    const sf = specFile({
      modules: [
        module({ name: "First", members: [] }),
        module({ name: "Second", members: [] }),
      ],
    });
    const text = serializeSpecFile(sf);
    expect(text).toContain("MODULE First {");
    expect(text).toContain("MODULE Second {");
    // Check there is a blank line between them
    const firstEnd = text.indexOf("}\n") + 2;
    const secondStart = text.indexOf("MODULE Second");
    const between = text.substring(firstEnd, secondStart);
    expect(between).toContain("\n");
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests: parse → serialize → parse produces equivalent AST
// ---------------------------------------------------------------------------

describe("round-trip: parse -> serialize -> parse", () => {
  /**
   * Helper that parses source, serializes the result, re-parses, and compares
   * the two ASTs for structural equality (ignoring loc properties).
   */
  function stripLoc(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(stripLoc);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "loc") continue;
      result[key] = stripLoc(value);
    }
    return result;
  }

  function roundTrip(source: string): void {
    const ast1 = parse(source);
    const serialized = serializeSpecFile(ast1);
    const ast2 = parse(serialized);
    expect(stripLoc(ast2)).toEqual(stripLoc(ast1));
  }

  it("should round-trip a minimal module", () => {
    roundTrip("MODULE Minimal {}");
  });

  it("should round-trip INPUT with constraints", () => {
    roundTrip(`MODULE Test {
  INPUT {
    email: Email [format:email]
    password: String [min:8, max:128]
    name: String [min:1, max:100]
  }
}`);
  });

  it("should round-trip OUTPUT block", () => {
    roundTrip(`MODULE Test {
  OUTPUT {
    user: User
    token: String
  }
}`);
  });

  it("should round-trip STATE block", () => {
    roundTrip(`MODULE Test {
  STATE {
    READS users: List<User>
    WRITES sessions: List<Session>
  }
}`);
  });

  it("should round-trip ACTION with SET and RETURN", () => {
    roundTrip(`MODULE Test {
  ACTION register(email: Email, password: String) -> User {
    SET hashedPassword = CALL hashPassword(password)
    RETURN user
  }
}`);
  });

  it("should round-trip WHEN statement", () => {
    roundTrip(`MODULE Test {
  ACTION check(email: Email) -> Void {
    WHEN CALL userExists(email) {
      FAIL EmailAlreadyExists "A user with this email already exists"
    }
    RETURN void
  }
}`);
  });

  it("should round-trip WHEN with OTHERWISE", () => {
    roundTrip(`MODULE Test {
  ACTION check(x: Int) -> String {
    WHEN x > 0 {
      RETURN positive
    } OTHERWISE {
      RETURN non_positive
    }
  }
}`);
  });

  it("should round-trip MATCH statement", () => {
    roundTrip(`MODULE Test {
  ACTION check(userId: UUID) -> Void {
    MATCH role {
      "admin" -> FAIL CannotDeleteAdmin "Cannot delete admin users"
      "user" -> {
        CALL removeUser(userId)
        EMIT UserDeleted { userId }
      }
    }
    RETURN void
  }
}`);
  });

  it("should round-trip EMIT with payload", () => {
    roundTrip(`MODULE Test {
  ACTION doSomething() -> Void {
    EMIT UserRegistered { user }
    RETURN void
  }
}`);
  });

  it("should round-trip INVARIANTS block", () => {
    roundTrip(`MODULE Test {
  INVARIANTS {
    ALWAYS "Passwords are stored as hashed values, never plaintext"
    NEVER "User email is shared with third parties without consent"
  }
}`);
  });

  it("should round-trip ERRORS block", () => {
    roundTrip(`MODULE Test {
  ERRORS {
    EmailAlreadyExists 409 "A user with this email already exists"
    UserNotFound 404 "The requested user was not found"
    CannotDeleteAdmin 403 "Cannot delete admin users"
  }
}`);
  });

  it("should round-trip DEPENDS block", () => {
    roundTrip(`MODULE Test {
  DEPENDS {
    HashService "Password hashing and verification"
    EmailService "Sending verification emails"
    Database "User persistence layer"
  }
}`);
  });

  it("should round-trip optional types", () => {
    roundTrip(`MODULE Test {
  INPUT {
    nickname: String?
  }
}`);
  });

  it("should round-trip collection types", () => {
    roundTrip(`MODULE Test {
  INPUT {
    items: List<String>
    lookup: Map<String, Int>
  }
}`);
  });

  it("should round-trip enum constraints", () => {
    roundTrip(`MODULE Test {
  INPUT {
    role: String [enum:("admin","user","guest")]
  }
}`);
  });

  it("should round-trip pattern constraints", () => {
    roundTrip(`MODULE Test {
  INPUT {
    code: String [pattern:"^[A-Z]{3}$"]
  }
}`);
  });

  it("should round-trip comments inside modules", () => {
    roundTrip(`MODULE Test {
  -- A comment inside the module
  INPUT {
    name: String
  }
}`);
  });

  it("should round-trip multiple member blocks preserving order", () => {
    roundTrip(`MODULE Test {
  INPUT {
    name: String
  }
  OUTPUT {
    result: String
  }
  ERRORS {
    NotFound 404 "Not found"
  }
}`);
  });
});
