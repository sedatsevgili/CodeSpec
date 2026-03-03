import { describe, it, expect } from "vitest";
import { mergeModules } from "../../src/analyzer/merge.js";
import {
  module as moduleNode,
  action,
  input,
  output,
  state,
  depends,
  field,
  parameter,
  primitiveType,
  namedType,
  stateField,
  dependencyDef,
  returnNode,
} from "../../src/ast/builder.js";

// ---- Tests ----------------------------------------------------------------

describe("mergeModules", () => {
  it("should return an empty module if no modules are provided", () => {
    const result = mergeModules([]);
    expect(result.name).toBe("MergedModule");
    expect(result.members).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it("should return the single module unchanged if only one is provided", () => {
    const mod = moduleNode({
      name: "UserService",
      members: [
        action({
          name: "getUser",
          params: [parameter({ name: "id", paramType: primitiveType("String") })],
          returnType: primitiveType("String"),
          body: [returnNode({ value: "id" })],
        }),
      ],
    });

    const result = mergeModules([mod]);
    expect(result).toBe(mod);
  });

  it("should use the first module's name for the merged result", () => {
    const mod1 = moduleNode({
      name: "UserService",
      members: [
        action({
          name: "getUser",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "AuthService",
      members: [
        action({
          name: "login",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.name).toBe("UserService");
  });

  it("should merge actions from multiple modules", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        action({
          name: "getUser",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        action({
          name: "createUser",
          params: [],
          returnType: primitiveType("Void"),
          body: [],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].name).toBe("getUser");
    expect(result.actions[1].name).toBe("createUser");
  });

  it("should deduplicate actions by name (first wins)", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        action({
          name: "process",
          params: [parameter({ name: "x", paramType: primitiveType("Int") })],
          returnType: primitiveType("Int"),
          body: [],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        action({
          name: "process",
          params: [parameter({ name: "y", paramType: primitiveType("String") })],
          returnType: primitiveType("String"),
          body: [],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].params[0].name).toBe("x");
  });

  it("should merge INPUT fields and deduplicate by name", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("String") }),
            field({ name: "name", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        input({
          fields: [
            field({ name: "email", fieldType: primitiveType("Email") }),
            field({ name: "age", fieldType: primitiveType("Int") }),
          ],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.input).toBeDefined();
    expect(result.input!.fields).toHaveLength(3);
    // First occurrence wins for "email"
    expect(result.input!.fields[0].fieldType).toEqual({
      kind: "primitive",
      name: "String",
    });
  });

  it("should merge OUTPUT fields and deduplicate by name", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        output({
          fields: [
            field({ name: "id", fieldType: primitiveType("UUID") }),
          ],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        output({
          fields: [
            field({ name: "id", fieldType: primitiveType("String") }),
            field({ name: "status", fieldType: primitiveType("String") }),
          ],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.output).toBeDefined();
    expect(result.output!.fields).toHaveLength(2);
  });

  it("should merge dependencies and deduplicate by name", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "bcrypt" }),
            dependencyDef({ name: "express" }),
          ],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "express" }),
            dependencyDef({ name: "zod" }),
          ],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.depends).toBeDefined();
    const names = result.depends!.dependencies.map((d) => d.name);
    expect(names).toEqual(["bcrypt", "express", "zod"]);
  });

  it("should merge STATE fields and deduplicate by name+access", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        state({
          fields: [
            stateField({
              access: "READS",
              name: "db",
              fieldType: namedType("db"),
            }),
          ],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        state({
          fields: [
            stateField({
              access: "READS",
              name: "db",
              fieldType: namedType("db"),
            }),
            stateField({
              access: "WRITES",
              name: "db",
              fieldType: namedType("db"),
            }),
          ],
        }),
      ],
    });

    const result = mergeModules([mod1, mod2]);
    expect(result.state).toBeDefined();
    expect(result.state!.fields).toHaveLength(2);
    const reads = result.state!.fields.filter((f) => f.access === "READS");
    const writes = result.state!.fields.filter((f) => f.access === "WRITES");
    expect(reads).toHaveLength(1);
    expect(writes).toHaveLength(1);
  });

  it("should produce deterministic output", () => {
    const mod1 = moduleNode({
      name: "Service",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "zod" }),
            dependencyDef({ name: "axios" }),
          ],
        }),
      ],
    });
    const mod2 = moduleNode({
      name: "Service",
      members: [
        depends({
          dependencies: [
            dependencyDef({ name: "moment" }),
          ],
        }),
      ],
    });

    const result1 = mergeModules([mod1, mod2]);
    const result2 = mergeModules([mod1, mod2]);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});
