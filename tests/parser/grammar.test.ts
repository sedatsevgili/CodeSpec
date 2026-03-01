import { describe, it, expect } from "vitest";
import * as peggy from "peggy";
import { readFileSync } from "fs";
import { resolve } from "path";

const grammarSource = readFileSync(
  resolve(__dirname, "../../src/parser/grammar.peggy"),
  "utf-8"
);

function buildParser() {
  return peggy.generate(grammarSource);
}

describe("CodeSpec Peggy grammar", () => {
  it("should compile without errors", () => {
    const parser = buildParser();
    expect(parser).toBeDefined();
    expect(typeof parser.parse).toBe("function");
  });

  it("should parse a minimal module", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Minimal {}`);
    expect(result.type).toBe("SpecFile");
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].type).toBe("Module");
    expect(result.modules[0].name).toBe("Minimal");
  });

  it("should parse INPUT block with fields and constraints", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INPUT {
    email: Email [format:email]
    password: String [min:8, max:128]
    name: String [min:1, max:100]
  }
}`);
    const mod = result.modules[0];
    expect(mod.input).toBeDefined();
    expect(mod.input.fields).toHaveLength(3);

    const emailField = mod.input.fields[0];
    expect(emailField.name).toBe("email");
    expect(emailField.fieldType).toEqual({ kind: "primitive", name: "Email" });
    expect(emailField.constraints).toEqual({ format: "email" });

    const passwordField = mod.input.fields[1];
    expect(passwordField.name).toBe("password");
    expect(passwordField.constraints).toEqual({ min: 8, max: 128 });
  });

  it("should parse OUTPUT block", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  OUTPUT {
    user: User
    token: String
  }
}`);
    const mod = result.modules[0];
    expect(mod.output).toBeDefined();
    expect(mod.output.fields).toHaveLength(2);
    expect(mod.output.fields[0].name).toBe("user");
    expect(mod.output.fields[0].fieldType).toEqual({ kind: "named", name: "User" });
    expect(mod.output.fields[1].fieldType).toEqual({ kind: "primitive", name: "String" });
  });

  it("should parse STATE block with READS and WRITES", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  STATE {
    READS users: List<User>
    WRITES users: List<User>
    WRITES sessions: List<Session>
  }
}`);
    const mod = result.modules[0];
    expect(mod.state).toBeDefined();
    expect(mod.state.fields).toHaveLength(3);
    expect(mod.state.fields[0].access).toBe("READS");
    expect(mod.state.fields[0].fieldType).toEqual({
      kind: "list",
      elementType: { kind: "named", name: "User" }
    });
    expect(mod.state.fields[1].access).toBe("WRITES");
  });

  it("should parse ACTION with SET and CALL", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION register(email: Email, password: String) -> User {
    SET hashedPassword = CALL hashPassword(password)
    RETURN user
  }
}`);
    const mod = result.modules[0];
    expect(mod.actions).toHaveLength(1);
    const action = mod.actions[0];
    expect(action.name).toBe("register");
    expect(action.params).toHaveLength(2);
    expect(action.params[0].name).toBe("email");
    expect(action.params[0].paramType).toEqual({ kind: "primitive", name: "Email" });
    expect(action.returnType).toEqual({ kind: "named", name: "User" });
    expect(action.body).toHaveLength(2);
    expect(action.body[0].type).toBe("Set");
    expect(action.body[0].variable).toBe("hashedPassword");
    expect(action.body[1].type).toBe("Return");
    expect(action.body[1].value).toBe("user");
  });

  it("should parse WHEN statement", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION check(email: Email) -> Void {
    WHEN CALL userExists(email) {
      FAIL EmailAlreadyExists "A user with this email already exists"
    }
    RETURN void
  }
}`);
    const action = result.modules[0].actions[0];
    expect(action.body[0].type).toBe("When");
    expect(action.body[0].condition).toBe("CALL userExists(email)");
    expect(action.body[0].body[0].type).toBe("Fail");
    expect(action.body[0].body[0].error).toBe("EmailAlreadyExists");
    expect(action.body[0].body[0].message).toBe("A user with this email already exists");
  });

  it("should parse WHEN with OTHERWISE", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION check(x: Int) -> String {
    WHEN x > 0 {
      RETURN positive
    } OTHERWISE {
      RETURN non_positive
    }
  }
}`);
    const when = result.modules[0].actions[0].body[0];
    expect(when.type).toBe("When");
    expect(when.otherwise).toBeDefined();
    expect(when.otherwise).toHaveLength(1);
    expect(when.otherwise[0].type).toBe("Return");
  });

  it("should parse MATCH statement", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION check(userId: UUID) -> Void {
    MATCH CALL getUserRole(userId) {
      "admin" -> FAIL CannotDeleteAdmin "Cannot delete admin users"
      "user" -> {
        CALL removeUser(userId)
        EMIT UserDeleted { userId }
      }
    }
    RETURN void
  }
}`);
    const match = result.modules[0].actions[0].body[0];
    expect(match.type).toBe("Match");
    expect(match.arms).toHaveLength(2);
    expect(match.arms[0].pattern).toBe("admin");
    expect(match.arms[0].body[0].type).toBe("Fail");
    expect(match.arms[1].pattern).toBe("user");
    expect(match.arms[1].body).toHaveLength(2);
    expect(match.arms[1].body[0].type).toBe("Call");
    expect(match.arms[1].body[1].type).toBe("Emit");
  });

  it("should parse EMIT statement with payload", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION doSomething() -> Void {
    EMIT UserRegistered { user }
    RETURN void
  }
}`);
    const emit = result.modules[0].actions[0].body[0];
    expect(emit.type).toBe("Emit");
    expect(emit.event).toBe("UserRegistered");
    expect(emit.payload).toBe("user");
  });

  it("should parse RETRY with ON_EXHAUST", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ACTION find(userId: UUID) -> Void {
    RETRY CALL findUser(userId) 3 TIMES DELAY "1s" {
      ON_EXHAUST {
        FAIL UserNotFound "User not found after retries"
      }
    }
    RETURN void
  }
}`);
    const retry = result.modules[0].actions[0].body[0];
    expect(retry.type).toBe("Retry");
    expect(retry.target).toBe("findUser");
    expect(retry.attempts).toBe(3);
    expect(retry.delay).toBe("1s");
    expect(retry.onExhaust).toHaveLength(1);
    expect(retry.onExhaust[0].type).toBe("Fail");
  });

  it("should parse INVARIANTS block", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INVARIANTS {
    ALWAYS "Passwords are stored as hashed values, never plaintext"
    NEVER "User email is shared with third parties without consent"
  }
}`);
    const inv = result.modules[0].invariants;
    expect(inv).toBeDefined();
    expect(inv.rules).toHaveLength(2);
    expect(inv.rules[0].kind).toBe("ALWAYS");
    expect(inv.rules[0].description).toBe("Passwords are stored as hashed values, never plaintext");
    expect(inv.rules[1].kind).toBe("NEVER");
  });

  it("should parse ERRORS block", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  ERRORS {
    EmailAlreadyExists 409 "A user with this email already exists"
    UserNotFound 404 "The requested user was not found"
    CannotDeleteAdmin 403 "Cannot delete admin users"
  }
}`);
    const errors = result.modules[0].errors;
    expect(errors).toBeDefined();
    expect(errors.errors).toHaveLength(3);
    expect(errors.errors[0].name).toBe("EmailAlreadyExists");
    expect(errors.errors[0].status).toBe(409);
    expect(errors.errors[0].message).toBe("A user with this email already exists");
  });

  it("should parse DEPENDS block", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  DEPENDS {
    HashService "Password hashing and verification"
    EmailService "Sending verification emails"
    Database "User persistence layer"
  }
}`);
    const deps = result.modules[0].depends;
    expect(deps).toBeDefined();
    expect(deps.dependencies).toHaveLength(3);
    expect(deps.dependencies[0].name).toBe("HashService");
    expect(deps.dependencies[0].description).toBe("Password hashing and verification");
  });

  it("should parse collection types: List<T> and Map<K, V>", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INPUT {
    items: List<String>
    lookup: Map<String, Int>
  }
}`);
    const fields = result.modules[0].input.fields;
    expect(fields[0].fieldType).toEqual({
      kind: "list",
      elementType: { kind: "primitive", name: "String" }
    });
    expect(fields[1].fieldType).toEqual({
      kind: "map",
      keyType: { kind: "primitive", name: "String" },
      valueType: { kind: "primitive", name: "Int" }
    });
  });

  it("should parse optional types with ?", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INPUT {
    nickname: String?
  }
}`);
    const field = result.modules[0].input.fields[0];
    expect(field.fieldType).toEqual({
      kind: "optional",
      innerType: { kind: "primitive", name: "String" }
    });
  });

  it("should parse comments as CommentNode", () => {
    const parser = buildParser();
    const result = parser.parse(`-- Top level comment
MODULE Test {
  -- Inside module
  INPUT {
    name: String
  }
}`);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].text).toBe("Top level comment");

    const mod = result.modules[0];
    // The comment inside the module should be in members
    const commentMembers = mod.members.filter((m: { type: string }) => m.type === "Comment");
    expect(commentMembers).toHaveLength(1);
    expect(commentMembers[0].text).toBe("Inside module");
  });

  it("should preserve member ordering in members array", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
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
    const mod = result.modules[0];
    expect(mod.members).toHaveLength(3);
    expect(mod.members[0].type).toBe("Input");
    expect(mod.members[1].type).toBe("Output");
    expect(mod.members[2].type).toBe("Errors");
  });

  it("should include source location on nodes", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {}`);
    const mod = result.modules[0];
    expect(mod.loc).toBeDefined();
    expect(mod.loc.start).toBeDefined();
    expect(mod.loc.start.line).toBe(1);
    expect(mod.loc.start.column).toBe(1);
    expect(mod.loc.end).toBeDefined();
  });

  it("should parse constraints with enum", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INPUT {
    role: String [enum:("admin","user","guest")]
  }
}`);
    const field = result.modules[0].input.fields[0];
    expect(field.constraints).toEqual({
      enum: ["admin", "user", "guest"]
    });
  });

  it("should parse constraints with pattern", () => {
    const parser = buildParser();
    const result = parser.parse(`MODULE Test {
  INPUT {
    code: String [pattern:"^[A-Z]{3}$"]
  }
}`);
    const field = result.modules[0].input.fields[0];
    expect(field.constraints).toEqual({
      pattern: "^[A-Z]{3}$"
    });
  });

  it("should parse the full example spec from the language reference", () => {
    const parser = buildParser();
    const input = `MODULE UserRegistration {
  INPUT {
    email: Email [format:email]
    password: String [min:8, max:128]
    name: String [min:1, max:100]
  }

  OUTPUT {
    user: User
    token: String
  }

  STATE {
    READS users: List<User>
    WRITES users: List<User>
    WRITES sessions: List<Session>
  }

  ACTION register(email: Email, password: String, name: String) -> User {
    SET hashedPassword = CALL hashPassword(password)

    WHEN CALL userExists(email) {
      FAIL EmailAlreadyExists "A user with this email already exists"
    }

    SET user = CALL createUser(email, hashedPassword, name)
    EMIT UserRegistered { user }
    RETURN user
  }

  ACTION deleteUser(userId: UUID) -> Void {
    RETRY CALL findUser(userId) 3 TIMES DELAY "1s" {
      ON_EXHAUST {
        FAIL UserNotFound "User not found after retries"
      }
    }

    MATCH CALL getUserRole(userId) {
      "admin" -> FAIL CannotDeleteAdmin "Cannot delete admin users"
      "user" -> {
        CALL removeUser(userId)
        EMIT UserDeleted { userId }
      }
    }

    RETURN void
  }

  INVARIANTS {
    ALWAYS "Passwords are stored as hashed values, never plaintext"
    NEVER "User email is shared with third parties without consent"
  }

  ERRORS {
    EmailAlreadyExists 409 "A user with this email already exists"
    UserNotFound 404 "The requested user was not found"
    CannotDeleteAdmin 403 "Cannot delete admin users"
  }

  DEPENDS {
    HashService "Password hashing and verification"
    EmailService "Sending verification emails"
    Database "User persistence layer"
  }
}`;
    const result = parser.parse(input);
    expect(result.type).toBe("SpecFile");
    expect(result.modules).toHaveLength(1);

    const mod = result.modules[0];
    expect(mod.name).toBe("UserRegistration");
    expect(mod.input).toBeDefined();
    expect(mod.input.fields).toHaveLength(3);
    expect(mod.output).toBeDefined();
    expect(mod.output.fields).toHaveLength(2);
    expect(mod.state).toBeDefined();
    expect(mod.state.fields).toHaveLength(3);
    expect(mod.actions).toHaveLength(2);
    expect(mod.invariants).toBeDefined();
    expect(mod.invariants.rules).toHaveLength(2);
    expect(mod.errors).toBeDefined();
    expect(mod.errors.errors).toHaveLength(3);
    expect(mod.depends).toBeDefined();
    expect(mod.depends.dependencies).toHaveLength(3);

    // Verify members array has all blocks in order
    expect(mod.members).toHaveLength(8);
    expect(mod.members.map((m: { type: string }) => m.type)).toEqual([
      "Input", "Output", "State", "Action", "Action",
      "Invariants", "Errors", "Depends"
    ]);
  });
});
