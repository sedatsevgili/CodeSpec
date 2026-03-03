import { describe, it, expect } from "vitest";
import { validateFromAst } from "../../src/validator/index.js";
import type { ValidationResult } from "../../src/validator/index.js";
import {
  primitiveType,
  listType,
  namedType,
  optionalType,
  field,
  parameter,
  input,
  output,
  stateField,
  state,
  returnNode,
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
// Helper
// ---------------------------------------------------------------------------

function errorMessages(result: ValidationResult): string[] {
  return result.issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message);
}

function warningMessages(result: ValidationResult): string[] {
  return result.issues
    .filter((i) => i.severity === "warning")
    .map((i) => i.message);
}

// ---------------------------------------------------------------------------
// validateFromAst — parsing errors
// ---------------------------------------------------------------------------

describe("validateFromAst — spec parsing", () => {
  it("should report an error for unparseable spec text", () => {
    const sourceModule = module({ name: "Test", members: [] });
    const result = validateFromAst("THIS IS NOT VALID CODESPEC !!!", sourceModule);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe("error");
    expect(result.issues[0].message).toContain("Failed to parse");
  });

  it("should report an error when spec has no MODULE", () => {
    // An empty string that could parse as empty (depends on grammar).
    // We use a comment-only input that yields no modules.
    const sourceModule = module({ name: "Test", members: [] });
    const result = validateFromAst("-- just a comment\n", sourceModule);
    expect(result.valid).toBe(false);
    expect(errorMessages(result).some((m) => m.includes("No MODULE"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateFromAst — identical spec and source
// ---------------------------------------------------------------------------

describe("validateFromAst — identical spec and source", () => {
  it("should report valid when spec matches source exactly", () => {
    const mod = module({
      name: "UserService",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [returnNode({ value: "void" })],
        }),
      ],
    });

    const specText = `MODULE UserService {
  INPUT {
    email: Email
  }
  ACTION register(email: Email) -> Void {
    RETURN void
  }
}`;

    const result = validateFromAst(specText, mod);
    expect(result.valid).toBe(true);
    expect(errorMessages(result)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateFromAst — drift detection
// ---------------------------------------------------------------------------

describe("validateFromAst — drift detection", () => {
  it("should detect missing action in source", () => {
    const specText = `MODULE Test {
  ACTION register(email: Email) -> Void {
    RETURN void
  }
  ACTION login(email: Email) -> Void {
    RETURN void
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [returnNode({ value: "void" })],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("login") && m.includes("missing")),
    ).toBe(true);
  });

  it("should detect extra action in source", () => {
    const specText = `MODULE Test {
  ACTION register(email: Email) -> Void {
    RETURN void
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [returnNode({ value: "void" })],
        }),
        action({
          name: "login",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("login") && m.includes("source")),
    ).toBe(true);
  });

  it("should detect changed return type", () => {
    const specText = `MODULE Test {
  ACTION getUser() -> User {
    RETURN user
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        action({
          name: "getUser",
          params: [],
          returnType: optionalType(namedType("User")),
          body: [returnNode({ value: "user" })],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("return type")),
    ).toBe(true);
  });

  it("should detect missing input field", () => {
    const specText = `MODULE Test {
  INPUT {
    email: Email
    password: String
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("password") && m.includes("missing")),
    ).toBe(true);
  });

  it("should detect changed error definition", () => {
    const specText = `MODULE Test {
  ERRORS {
    NotFound 404 "Not found"
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 410, message: "Not found" }),
          ],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("NotFound") && m.includes("status")),
    ).toBe(true);
  });

  it("should detect added dependency", () => {
    const specText = `MODULE Test {
  DEPENDS {
    Database "User store"
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "Database", description: "User store" }),
            dependencyDef({ name: "Redis" }),
          ],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(false);
    expect(
      errorMessages(result).some((m) => m.includes("Redis")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateFromAst — invariant drift is a warning, not an error
// ---------------------------------------------------------------------------

describe("validateFromAst — invariant drift severity", () => {
  it("should report invariant drift as warnings, not errors", () => {
    const specText = `MODULE Test {
  INVARIANTS {
    ALWAYS "Passwords are hashed"
    NEVER "Tokens are logged"
  }
}`;

    const sourceModule = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
            // "Tokens are logged" removed, "Data is encrypted" added
            invariantRule({ kind: "ALWAYS", description: "Data is encrypted" }),
          ],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    // Invariant drift should be warnings, so validation should still pass
    expect(result.valid).toBe(true);
    expect(warningMessages(result).length).toBeGreaterThan(0);
    expect(errorMessages(result)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateFromAst — full module comparison
// ---------------------------------------------------------------------------

describe("validateFromAst — full module comparison", () => {
  it("should validate a complete module with multiple blocks", () => {
    const specText = `MODULE UserService {
  INPUT {
    email: Email
    password: String
  }

  OUTPUT {
    user: User
    token: String
  }

  STATE {
    READS users: List<User>
    WRITES sessions: List<Session>
  }

  ACTION register(email: Email, password: String) -> User {
    RETURN user
  }

  ERRORS {
    EmailAlreadyExists 409 "Email already taken"
    NotFound 404 "User not found"
  }

  DEPENDS {
    Database "User persistence"
    HashService "Password hashing"
  }

  INVARIANTS {
    ALWAYS "Passwords are stored hashed"
  }
}`;

    // Build identical source module
    const sourceModule = module({
      name: "UserService",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "password", fieldType: primitiveType("String") }),
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
            stateField({ access: "READS", name: "users", fieldType: listType(namedType("User")) }),
            stateField({ access: "WRITES", name: "sessions", fieldType: listType(namedType("Session")) }),
          ],
        }),
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
            parameter({ name: "password", paramType: primitiveType("String") }),
          ],
          returnType: namedType("User"),
          body: [returnNode({ value: "user" })],
        }),
        errors({
          errors: [
            errorDef({ name: "EmailAlreadyExists", status: 409, message: "Email already taken" }),
            errorDef({ name: "NotFound", status: 404, message: "User not found" }),
          ],
        }),
        depends({
          dependencies: [
            dependencyDef({ name: "Database", description: "User persistence" }),
            dependencyDef({ name: "HashService", description: "Password hashing" }),
          ],
        }),
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are stored hashed" }),
          ],
        }),
      ],
    });

    const result = validateFromAst(specText, sourceModule);
    expect(result.valid).toBe(true);
    expect(errorMessages(result)).toHaveLength(0);
  });
});
