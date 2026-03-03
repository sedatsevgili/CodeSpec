import { describe, it, expect } from "vitest";
import { detectDrift } from "../../src/validator/drift.js";
import type { DriftIssue } from "../../src/validator/drift.js";
import {
  primitiveType,
  listType,
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
  returnNode,
  fail,
  call,
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
// Helper to find a drift issue by path substring
// ---------------------------------------------------------------------------

function findIssue(issues: DriftIssue[], pathSubstring: string): DriftIssue | undefined {
  return issues.find((i) => i.path.includes(pathSubstring));
}

// ---------------------------------------------------------------------------
// Identical modules — no drift
// ---------------------------------------------------------------------------

describe("detectDrift — identical modules", () => {
  it("should return no issues for identical empty modules", () => {
    const mod = module({ name: "Test", members: [] });
    const issues = detectDrift(mod, mod);
    expect(issues).toEqual([]);
  });

  it("should return no issues for identical modules with all blocks", () => {
    const mod = module({
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
          ],
        }),
        state({
          fields: [
            stateField({ access: "READS", name: "users", fieldType: listType(namedType("User")) }),
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
            errorDef({ name: "NotFound", status: 404, message: "Not found" }),
          ],
        }),
        depends({
          dependencies: [
            dependencyDef({ name: "Database", description: "User persistence" }),
          ],
        }),
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
          ],
        }),
      ],
    });
    const issues = detectDrift(mod, mod);
    expect(issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Module name drift
// ---------------------------------------------------------------------------

describe("detectDrift — module name", () => {
  it("should detect module name change", () => {
    const specMod = module({ name: "UserService", members: [] });
    const sourceMod = module({ name: "AccountService", members: [] });
    const issues = detectDrift(specMod, sourceMod);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("changed");
    expect(issues[0].path).toBe("MODULE");
    expect(issues[0].message).toContain("UserService");
    expect(issues[0].message).toContain("AccountService");
  });
});

// ---------------------------------------------------------------------------
// INPUT field drift
// ---------------------------------------------------------------------------

describe("detectDrift — INPUT fields", () => {
  it("should detect a field added in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "name", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.name");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });

  it("should detect a field removed from source", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "name", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.name");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });

  it("should detect a field type change", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "age", fieldType: primitiveType("Int") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "age", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.age.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("Int");
    expect(issue!.message).toContain("String");
  });

  it("should detect a constraint change", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({
              name: "password",
              fieldType: primitiveType("String"),
              constraints: constraints({ min: 8, max: 128 }),
            }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({
              name: "password",
              fieldType: primitiveType("String"),
              constraints: constraints({ min: 12, max: 256 }),
            }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.password.constraints");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
  });

  it("should handle INPUT present in spec but absent in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
      ],
    });
    const sourceMod = module({ name: "Test", members: [] });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.email");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });
});

// ---------------------------------------------------------------------------
// OUTPUT field drift
// ---------------------------------------------------------------------------

describe("detectDrift — OUTPUT fields", () => {
  it("should detect output field changes", () => {
    const specMod = module({
      name: "Test",
      members: [
        output({
          fields: [
            field({ name: "token", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        output({
          fields: [
            field({ name: "token", fieldType: primitiveType("UUID") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "OUTPUT.token.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
  });
});

// ---------------------------------------------------------------------------
// STATE field drift
// ---------------------------------------------------------------------------

describe("detectDrift — STATE fields", () => {
  it("should detect state field added", () => {
    const specMod = module({ name: "Test", members: [] });
    const sourceMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "READS", name: "cache", fieldType: namedType("Cache") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "STATE.cache");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });

  it("should detect state access mode change", () => {
    const specMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "READS", name: "users", fieldType: listType(namedType("User")) }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "WRITES", name: "users", fieldType: listType(namedType("User")) }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "STATE.users.access");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("READS");
    expect(issue!.message).toContain("WRITES");
  });

  it("should detect state field type change", () => {
    const specMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "READS", name: "count", fieldType: primitiveType("Int") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "READS", name: "count", fieldType: primitiveType("Float") }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "STATE.count.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
  });
});

// ---------------------------------------------------------------------------
// ACTION drift
// ---------------------------------------------------------------------------

describe("detectDrift — ACTIONs", () => {
  it("should detect a missing action in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const sourceMod = module({ name: "Test", members: [] });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.register");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });

  it("should detect an extra action in source", () => {
    const specMod = module({ name: "Test", members: [] });
    const sourceMod = module({
      name: "Test",
      members: [
        action({
          name: "login",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.login");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });

  it("should detect a return type change", () => {
    const specMod = module({
      name: "Test",
      members: [
        action({
          name: "getUser",
          params: [],
          returnType: namedType("User"),
          body: [],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        action({
          name: "getUser",
          params: [],
          returnType: optionalType(namedType("User")),
          body: [],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.getUser.returnType");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("User");
    expect(issue!.message).toContain("User?");
  });

  it("should detect a missing parameter", () => {
    const specMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
            parameter({ name: "password", paramType: primitiveType("String") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.register.params.password");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });

  it("should detect an added parameter", () => {
    const specMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
            parameter({ name: "name", paramType: primitiveType("String") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.register.params.name");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });

  it("should detect a parameter type change", () => {
    const specMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("String") }),
          ],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ACTION.register.params.email.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("Email");
    expect(issue!.message).toContain("String");
  });
});

// ---------------------------------------------------------------------------
// ERRORS drift
// ---------------------------------------------------------------------------

describe("detectDrift — ERRORS", () => {
  it("should detect an error removed from source", () => {
    const specMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
            errorDef({ name: "Forbidden", status: 403 }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ERRORS.Forbidden");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });

  it("should detect an error added in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
            errorDef({ name: "BadRequest", status: 400 }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ERRORS.BadRequest");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });

  it("should detect an error status change", () => {
    const specMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 404 })],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 410 })],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ERRORS.NotFound.status");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("404");
    expect(issue!.message).toContain("410");
  });

  it("should detect an error message change", () => {
    const specMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 404, message: "Not found" })],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 404, message: "Resource not found" })],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "ERRORS.NotFound.message");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
  });
});

// ---------------------------------------------------------------------------
// DEPENDS drift
// ---------------------------------------------------------------------------

describe("detectDrift — DEPENDS", () => {
  it("should detect a dependency removed from source", () => {
    const specMod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "Database" }),
            dependencyDef({ name: "Cache" }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "Database" }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "DEPENDS.Cache");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("removed");
  });

  it("should detect a dependency added in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "Database" }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "Database" }),
            dependencyDef({ name: "Redis" }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "DEPENDS.Redis");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("added");
  });
});

// ---------------------------------------------------------------------------
// INVARIANTS drift
// ---------------------------------------------------------------------------

describe("detectDrift — INVARIANTS", () => {
  it("should detect an invariant removed from source", () => {
    const specMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
            invariantRule({ kind: "NEVER", description: "Emails are shared" }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("removed");
    expect(issues[0].message).toContain("Emails are shared");
  });

  it("should detect an invariant added in source", () => {
    const specMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
            invariantRule({ kind: "NEVER", description: "Tokens expire without notice" }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("added");
    expect(issues[0].message).toContain("Tokens expire without notice");
  });

  it("should return no issues for identical invariants", () => {
    const rules = [
      invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
    ];
    const specMod = module({
      name: "Test",
      members: [invariants({ rules })],
    });
    const sourceMod = module({
      name: "Test",
      members: [invariants({ rules })],
    });
    const issues = detectDrift(specMod, sourceMod);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Complex type drift
// ---------------------------------------------------------------------------

describe("detectDrift — complex types", () => {
  it("should detect List element type change", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "items", fieldType: listType(primitiveType("String")) }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "items", fieldType: listType(primitiveType("Int")) }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.items.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("List<String>");
    expect(issue!.message).toContain("List<Int>");
  });

  it("should detect optional type mismatch", () => {
    const specMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "nickname", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const sourceMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "nickname", fieldType: optionalType(primitiveType("String")) }),
          ],
        }),
      ],
    });
    const issues = detectDrift(specMod, sourceMod);
    const issue = findIssue(issues, "INPUT.nickname.type");
    expect(issue).toBeDefined();
    expect(issue!.kind).toBe("changed");
    expect(issue!.message).toContain("String?");
  });
});

// ---------------------------------------------------------------------------
// Multiple drift issues at once
// ---------------------------------------------------------------------------

describe("detectDrift — multiple issues", () => {
  it("should report all drift issues across all blocks", () => {
    const specMod = module({
      name: "UserService",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "password", fieldType: primitiveType("String") }),
          ],
        }),
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
          ],
          returnType: namedType("User"),
          body: [returnNode({ value: "user" })],
        }),
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
          ],
        }),
        depends({
          dependencies: [
            dependencyDef({ name: "Database" }),
          ],
        }),
      ],
    });

    const sourceMod = module({
      name: "UserService",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("String") }), // type changed
            // password removed
            field({ name: "name", fieldType: primitiveType("String") }), // new field
          ],
        }),
        action({
          name: "register",
          params: [
            parameter({ name: "email", paramType: primitiveType("Email") }),
            parameter({ name: "name", paramType: primitiveType("String") }), // new param
          ],
          returnType: namedType("User"),
          body: [returnNode({ value: "user" })],
        }),
        action({
          name: "login", // new action
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
            errorDef({ name: "BadRequest", status: 400 }), // new error
          ],
        }),
        // Database dependency removed, Redis added
        depends({
          dependencies: [
            dependencyDef({ name: "Redis" }),
          ],
        }),
      ],
    });

    const issues = detectDrift(specMod, sourceMod);

    // Verify we get issues for all the changes
    expect(findIssue(issues, "INPUT.email.type")).toBeDefined();
    expect(findIssue(issues, "INPUT.password")).toBeDefined();
    expect(findIssue(issues, "INPUT.name")).toBeDefined();
    expect(findIssue(issues, "ACTION.register.params.name")).toBeDefined();
    expect(findIssue(issues, "ACTION.login")).toBeDefined();
    expect(findIssue(issues, "ERRORS.BadRequest")).toBeDefined();
    expect(findIssue(issues, "DEPENDS.Database")).toBeDefined();
    expect(findIssue(issues, "DEPENDS.Redis")).toBeDefined();

    // Should be at least 8 issues
    expect(issues.length).toBeGreaterThanOrEqual(8);
  });
});
