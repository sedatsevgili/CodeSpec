import { describe, it, expect } from "vitest";
import { generateTypeScript } from "../../src/generator/typescript.js";
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
} from "../../src/ast/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a comprehensive sample module for snapshot testing. */
function buildSampleModule() {
  return module({
    name: "UserRegistration",
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
          field({
            name: "nickname",
            fieldType: optionalType(primitiveType("String")),
          }),
        ],
      }),
      output({
        fields: [
          field({ name: "user", fieldType: namedType("User") }),
          field({ name: "token", fieldType: primitiveType("String") }),
        ],
      }),
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
      errors({
        errors: [
          errorDef({
            name: "EmailAlreadyExists",
            status: 409,
            message: "A user with this email already exists",
          }),
          errorDef({
            name: "UserNotFound",
            status: 404,
            message: "The requested user was not found",
          }),
          errorDef({ name: "InternalError" }),
        ],
      }),
      action({
        name: "register",
        params: [
          parameter({ name: "email", paramType: primitiveType("Email") }),
          parameter({ name: "password", paramType: primitiveType("String") }),
        ],
        returnType: namedType("User"),
        body: [
          when({
            condition: "CALL userExists(email)",
            body: [
              fail({
                error: "EmailAlreadyExists",
                message: "A user with this email already exists",
              }),
            ],
          }),
          set({
            variable: "hashedPassword",
            value: "CALL hashPassword(password)",
          }),
          call({
            target: "createUser",
            args: ["email", "hashedPassword"],
            assignTo: "user",
          }),
          emit({ event: "UserRegistered", payload: "user" }),
          returnNode({ value: "user" }),
        ],
      }),
      action({
        name: "deleteUser",
        params: [
          parameter({ name: "userId", paramType: primitiveType("UUID") }),
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
                    error: "Forbidden",
                    message: "Cannot delete admin users",
                  }),
                ],
              }),
              matchArm({
                pattern: "user",
                body: [
                  call({ target: "removeUser", args: ["userId"] }),
                  emit({ event: "UserDeleted", payload: "userId" }),
                ],
              }),
            ],
          }),
        ],
      }),
      invariants({
        rules: [
          invariantRule({
            kind: "ALWAYS",
            description: "Passwords are stored as hashed values",
          }),
          invariantRule({
            kind: "NEVER",
            description: "Email is shared without consent",
          }),
        ],
      }),
      depends({
        dependencies: [
          dependencyDef({
            name: "Database",
            description: "User persistence layer",
          }),
          dependencyDef({ name: "HashService" }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("TypeScript Generator: header", () => {
  it("should include the header comment", () => {
    const mod = module({ name: "Empty", members: [] });
    const code = generateTypeScript(mod);
    expect(code).toContain("// Generated by CodeSpec — do not edit manually");
  });
});

// ---------------------------------------------------------------------------
// Interface generation
// ---------------------------------------------------------------------------

describe("TypeScript Generator: interfaces", () => {
  it("should generate an input interface with correct types", () => {
    const mod = module({
      name: "Login",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "password", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("export interface LoginInput {");
    expect(code).toContain("  email: string;");
    expect(code).toContain("  password: string;");
  });

  it("should generate an output interface", () => {
    const mod = module({
      name: "Login",
      members: [
        output({
          fields: [
            field({ name: "user", fieldType: namedType("User") }),
            field({ name: "token", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("export interface LoginOutput {");
    expect(code).toContain("  user: User;");
    expect(code).toContain("  token: string;");
  });

  it("should handle optional fields with ? syntax", () => {
    const mod = module({
      name: "Profile",
      members: [
        input({
          fields: [
            field({
              name: "nickname",
              fieldType: optionalType(primitiveType("String")),
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("  nickname?: string;");
  });

  it("should handle list types", () => {
    const mod = module({
      name: "Search",
      members: [
        output({
          fields: [
            field({
              name: "results",
              fieldType: listType(namedType("User")),
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("  results: User[];");
  });

  it("should handle map types", () => {
    const mod = module({
      name: "Config",
      members: [
        input({
          fields: [
            field({
              name: "settings",
              fieldType: mapType(
                primitiveType("String"),
                primitiveType("String"),
              ),
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("  settings: Map<string, string>;");
  });
});

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

describe("TypeScript Generator: type mapping", () => {
  it("should map all primitive types correctly", () => {
    const mod = module({
      name: "AllTypes",
      members: [
        input({
          fields: [
            field({ name: "s", fieldType: primitiveType("String") }),
            field({ name: "i", fieldType: primitiveType("Int") }),
            field({ name: "f", fieldType: primitiveType("Float") }),
            field({ name: "b", fieldType: primitiveType("Bool") }),
            field({ name: "d", fieldType: primitiveType("DateTime") }),
            field({ name: "e", fieldType: primitiveType("Email") }),
            field({ name: "h", fieldType: primitiveType("Hash") }),
            field({ name: "u", fieldType: primitiveType("UUID") }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("  s: string;");
    expect(code).toContain("  i: number;");
    expect(code).toContain("  f: number;");
    expect(code).toContain("  b: boolean;");
    expect(code).toContain("  d: Date;");
    expect(code).toContain("  e: string;");
    expect(code).toContain("  h: string;");
    expect(code).toContain("  u: string;");
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("TypeScript Generator: error classes", () => {
  it("should generate error classes from ERRORS block", () => {
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
            errorDef({ name: "InternalError" }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("export class NotFoundError extends Error {");
    expect(code).toContain("public readonly status = 404;");
    expect(code).toContain('super(message ?? "Not found")');
    expect(code).toContain("export class InternalErrorError extends Error {");
  });
});

// ---------------------------------------------------------------------------
// Function generation
// ---------------------------------------------------------------------------

describe("TypeScript Generator: functions", () => {
  it("should generate a typed function from an ACTION", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "greet",
          params: [
            parameter({ name: "name", paramType: primitiveType("String") }),
          ],
          returnType: primitiveType("String"),
          body: [returnNode({ value: "name" })],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain(
      "export function greet(name: string): string {",
    );
    expect(code).toContain("  return name;");
  });

  it("should generate functions with no params", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "getAll",
          params: [],
          returnType: listType(namedType("User")),
          body: [returnNode({ value: "users" })],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("export function getAll(): User[] {");
  });

  it("should generate void return type correctly", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "doNothing",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("export function doNothing(): void {");
  });
});

// ---------------------------------------------------------------------------
// Statement generation
// ---------------------------------------------------------------------------

describe("TypeScript Generator: statements", () => {
  it("should generate WHEN as if statement", () => {
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
              body: [returnNode({ value: '"positive"' })],
              otherwise: [returnNode({ value: '"non-positive"' })],
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("if (x > 0) {");
    expect(code).toContain('return "positive";');
    expect(code).toContain("} else {");
    expect(code).toContain('return "non-positive";');
  });

  it("should generate WHEN without OTHERWISE", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "check",
          params: [
            parameter({ name: "x", paramType: primitiveType("Int") }),
          ],
          returnType: primitiveType("Void"),
          body: [
            when({
              condition: "x > 0",
              body: [emit({ event: "Positive" })],
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("if (x > 0) {");
    expect(code).not.toContain("else");
  });

  it("should generate MATCH as switch statement", () => {
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
                  body: [returnNode({ value: '"admin-panel"' })],
                }),
                matchArm({
                  pattern: "_",
                  body: [returnNode({ value: '"home"' })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("switch (role) {");
    expect(code).toContain('case "admin": {');
    expect(code).toContain("default: {");
    expect(code).toContain("break;");
  });

  it("should generate SET as const assignment", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            set({ variable: "result", value: "42" }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("const result = 42;");
  });

  it("should generate CALL as function call", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            call({ target: "doWork", args: ["a", "b"] }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("doWork(a, b);");
  });

  it("should generate CALL with assignment", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            call({
              target: "doWork",
              args: ["a", "b"],
              assignTo: "result",
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("const result = doWork(a, b);");
  });

  it("should generate FAIL as throw", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            fail({ error: "NotFound", message: "User not found" }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain('throw new NotFoundError("User not found");');
  });

  it("should generate FAIL without message", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [fail({ error: "NotFound" })],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("throw new NotFoundError();");
  });

  it("should generate EMIT as emit call", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            emit({ event: "Created" }),
            emit({ event: "Updated", payload: "data" }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain('emit("Created");');
    expect(code).toContain('emit("Updated", data);');
  });

  it("should generate RETRY as for loop with try/catch", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [
            retry({
              target: "fetchData",
              attempts: 3,
              delay: "1s",
              onExhaust: [
                fail({ error: "ServiceUnavailable", message: "Service down" }),
              ],
            }),
          ],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("for (let attempt = 1; attempt <= 3; attempt++)");
    expect(code).toContain("try {");
    expect(code).toContain("fetchData();");
    expect(code).toContain("break;");
    expect(code).toContain("} catch (error) {");
    expect(code).toContain("if (attempt === 3)");
    expect(code).toContain("throw new ServiceUnavailableError");
    expect(code).toContain("// delay: 1s");
  });

  it("should generate LIMIT as rate limit check", () => {
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
    const code = generateTypeScript(mod);
    expect(code).toContain("// LIMIT: 100 per");
    expect(code).toContain("if (isRateLimitExceeded(100,");
    expect(code).toContain("throw new RateLimitedError");
  });

  it("should generate comments", () => {
    const mod = module({
      name: "Test",
      members: [
        action({
          name: "process",
          params: [],
          returnType: primitiveType("Void"),
          body: [comment({ text: "This is a comment" })],
        }),
      ],
    });
    const code = generateTypeScript(mod);
    expect(code).toContain("// This is a comment");
  });
});

// ---------------------------------------------------------------------------
// Snapshot: full module
// ---------------------------------------------------------------------------

describe("TypeScript Generator: snapshot", () => {
  it("should produce deterministic output for a full module", () => {
    const mod = buildSampleModule();
    const code = generateTypeScript(mod);

    // Determinism check: generating twice yields same output
    const code2 = generateTypeScript(mod);
    expect(code).toBe(code2);

    // Structure checks
    expect(code).toContain("// Generated by CodeSpec — do not edit manually");
    expect(code).toContain("export interface UserRegistrationInput {");
    expect(code).toContain("export interface UserRegistrationOutput {");
    expect(code).toContain("export class EmailAlreadyExistsError extends Error {");
    expect(code).toContain("export function register(email: string, password: string): User {");
    expect(code).toContain("export function deleteUser(userId: string, role: string): void {");
    expect(code).toContain("nickname?: string;");
    expect(code).toContain("if (CALL userExists(email)) {");
    expect(code).toContain("switch (role) {");
    expect(code).toContain('emit("UserRegistered", user);');
    expect(code).toContain("return user;");
  });

  it("should match snapshot", () => {
    const mod = buildSampleModule();
    const code = generateTypeScript(mod);
    expect(code).toMatchSnapshot();
  });
});
