import { describe, it, expect } from "vitest";
import { diffSpecFiles, diffModules } from "../../src/validator/diff.js";
import type { DiffResult, SpecChange } from "../../src/validator/diff.js";
import {
  primitiveType,
  namedType,
  optionalType,
  listType,
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
  specFile,
} from "../../src/ast/index.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function findChange(changes: readonly SpecChange[], pathSubstring: string): SpecChange | undefined {
  return changes.find((c) => c.path.includes(pathSubstring));
}

// ---------------------------------------------------------------------------
// diffSpecFiles — identical specs
// ---------------------------------------------------------------------------

describe("diffSpecFiles — identical specs", () => {
  it("should report identical for empty spec files", () => {
    const sf = specFile({ modules: [] });
    const result = diffSpecFiles(sf, sf);
    expect(result.identical).toBe(true);
    expect(result.changes).toHaveLength(0);
    expect(result.summary).toContain("No behavioral changes");
  });

  it("should report identical for matching modules", () => {
    const sf = specFile({
      modules: [
        module({
          name: "Test",
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
        }),
      ],
    });
    const result = diffSpecFiles(sf, sf);
    expect(result.identical).toBe(true);
    expect(result.changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// diffSpecFiles — module-level changes
// ---------------------------------------------------------------------------

describe("diffSpecFiles — module-level changes", () => {
  it("should detect a module removed in new spec", () => {
    const oldSf = specFile({
      modules: [
        module({ name: "UserService", members: [] }),
        module({ name: "AuthService", members: [] }),
      ],
    });
    const newSf = specFile({
      modules: [
        module({ name: "UserService", members: [] }),
      ],
    });
    const result = diffSpecFiles(oldSf, newSf);
    expect(result.identical).toBe(false);
    const change = findChange(result.changes, "MODULE.AuthService");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("removed");
  });

  it("should detect a module added in new spec", () => {
    const oldSf = specFile({
      modules: [
        module({ name: "UserService", members: [] }),
      ],
    });
    const newSf = specFile({
      modules: [
        module({ name: "UserService", members: [] }),
        module({ name: "AuthService", members: [] }),
      ],
    });
    const result = diffSpecFiles(oldSf, newSf);
    expect(result.identical).toBe(false);
    const change = findChange(result.changes, "MODULE.AuthService");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("added");
  });
});

// ---------------------------------------------------------------------------
// diffModules — action changes
// ---------------------------------------------------------------------------

describe("diffModules — action changes", () => {
  it("should detect an added action", () => {
    const oldMod = module({
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
    const newMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
        action({
          name: "login",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "ACTION.login");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("added");
  });

  it("should detect a removed action", () => {
    const oldMod = module({
      name: "Test",
      members: [
        action({
          name: "register",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
        action({
          name: "login",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const newMod = module({
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
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "ACTION.login");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("removed");
  });

  it("should detect a modified action (return type change)", () => {
    const oldMod = module({
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
    const newMod = module({
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
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "ACTION.getUser.returnType");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("modified");
  });

  it("should detect added and removed parameters", () => {
    const oldMod = module({
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
    const newMod = module({
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
    const changes = diffModules(oldMod, newMod);
    expect(findChange(changes, "params.password")).toBeDefined();
    expect(findChange(changes, "params.name")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// diffModules — field changes
// ---------------------------------------------------------------------------

describe("diffModules — field changes", () => {
  it("should detect input field changes", () => {
    const oldMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
          ],
        }),
      ],
    });
    const newMod = module({
      name: "Test",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "INPUT.email.type");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("modified");
  });

  it("should detect output field added", () => {
    const oldMod = module({ name: "Test", members: [] });
    const newMod = module({
      name: "Test",
      members: [
        output({
          fields: [
            field({ name: "token", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "OUTPUT.token");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("added");
  });
});

// ---------------------------------------------------------------------------
// diffModules — error changes
// ---------------------------------------------------------------------------

describe("diffModules — error changes", () => {
  it("should detect error added and removed", () => {
    const oldMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "NotFound", status: 404 }),
          ],
        }),
      ],
    });
    const newMod = module({
      name: "Test",
      members: [
        errors({
          errors: [
            errorDef({ name: "BadRequest", status: 400 }),
          ],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    expect(findChange(changes, "ERRORS.NotFound")?.kind).toBe("removed");
    expect(findChange(changes, "ERRORS.BadRequest")?.kind).toBe("added");
  });

  it("should detect error status modification", () => {
    const oldMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 404 })],
        }),
      ],
    });
    const newMod = module({
      name: "Test",
      members: [
        errors({
          errors: [errorDef({ name: "NotFound", status: 410 })],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "ERRORS.NotFound.status");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("modified");
  });
});

// ---------------------------------------------------------------------------
// diffModules — dependency changes
// ---------------------------------------------------------------------------

describe("diffModules — dependency changes", () => {
  it("should detect dependency changes", () => {
    const oldMod = module({
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
    const newMod = module({
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
    const changes = diffModules(oldMod, newMod);
    expect(findChange(changes, "DEPENDS.Cache")?.kind).toBe("removed");
    expect(findChange(changes, "DEPENDS.Redis")?.kind).toBe("added");
  });
});

// ---------------------------------------------------------------------------
// diffModules — invariant changes
// ---------------------------------------------------------------------------

describe("diffModules — invariant changes", () => {
  it("should detect invariant added", () => {
    const oldMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
          ],
        }),
      ],
    });
    const newMod = module({
      name: "Test",
      members: [
        invariants({
          rules: [
            invariantRule({ kind: "ALWAYS", description: "Passwords are hashed" }),
            invariantRule({ kind: "NEVER", description: "Tokens logged" }),
          ],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("added");
    expect(changes[0].message).toContain("Tokens logged");
  });
});

// ---------------------------------------------------------------------------
// diffModules — state changes
// ---------------------------------------------------------------------------

describe("diffModules — state changes", () => {
  it("should detect state field access mode change", () => {
    const oldMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "READS", name: "users", fieldType: listType(namedType("User")) }),
          ],
        }),
      ],
    });
    const newMod = module({
      name: "Test",
      members: [
        state({
          fields: [
            stateField({ access: "WRITES", name: "users", fieldType: listType(namedType("User")) }),
          ],
        }),
      ],
    });
    const changes = diffModules(oldMod, newMod);
    const change = findChange(changes, "STATE.users.access");
    expect(change).toBeDefined();
    expect(change!.kind).toBe("modified");
  });
});

// ---------------------------------------------------------------------------
// Summary formatting
// ---------------------------------------------------------------------------

describe("diffSpecFiles — summary", () => {
  it("should format summary for single change", () => {
    const oldSf = specFile({
      modules: [module({ name: "Test", members: [] })],
    });
    const newSf = specFile({
      modules: [
        module({
          name: "Test",
          members: [
            action({
              name: "login",
              params: [],
              returnType: primitiveType("Void"),
              body: [],
            }),
          ],
        }),
      ],
    });
    const result = diffSpecFiles(oldSf, newSf);
    expect(result.summary).toBe("1 change: 1 added");
  });

  it("should format summary for multiple change types", () => {
    const oldSf = specFile({
      modules: [
        module({
          name: "Test",
          members: [
            action({
              name: "register",
              params: [],
              returnType: primitiveType("Void"),
              body: [],
            }),
            action({
              name: "delete",
              params: [],
              returnType: primitiveType("Void"),
              body: [],
            }),
          ],
        }),
      ],
    });
    const newSf = specFile({
      modules: [
        module({
          name: "Test",
          members: [
            action({
              name: "register",
              params: [],
              returnType: namedType("User"), // modified return type
              body: [],
            }),
            // delete removed
            action({
              name: "login", // added
              params: [],
              returnType: primitiveType("Void"),
              body: [],
            }),
          ],
        }),
      ],
    });
    const result = diffSpecFiles(oldSf, newSf);
    expect(result.identical).toBe(false);
    expect(result.summary).toContain("added");
    expect(result.summary).toContain("removed");
    expect(result.summary).toContain("modified");
  });
});
