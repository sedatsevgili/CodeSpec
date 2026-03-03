import { describe, it, expect } from "vitest";
import { analyzeJavaScriptSource } from "../../src/analyzer/javascript.js";
import type { ActionNode, WhenNode, ReturnNode } from "../../src/ast/nodes.js";

// ---- Helpers --------------------------------------------------------------

/** Shorthand to analyze source and return the module. */
function analyze(source: string, fileName?: string) {
  return analyzeJavaScriptSource(source, fileName ?? "test.js");
}

/** Get the first action from analyzed source. */
function firstAction(source: string): ActionNode {
  const mod = analyze(source);
  expect(mod.actions.length).toBeGreaterThan(0);
  return mod.actions[0];
}

// ---- Tests ----------------------------------------------------------------

describe("JavaScript Analyzer", () => {
  // ---- Module name derivation ---------------------------------------------

  describe("module name derivation", () => {
    it("should derive PascalCase module name from .js file name", () => {
      const mod = analyze("function foo() {}", "user-service.js");
      expect(mod.name).toBe("UserService");
    });

    it("should handle camelCase JS file names", () => {
      const mod = analyze("function foo() {}", "userService.js");
      expect(mod.name).toBe("UserService");
    });

    it("should default to module.js when no file name given", () => {
      const mod = analyzeJavaScriptSource("function foo() {}");
      expect(mod.name).toBe("Module");
    });
  });

  // ---- Basic function extraction -> ACTION --------------------------------

  describe("function extraction -> ACTION", () => {
    it("should extract a basic JS function as an ACTION", () => {
      const mod = analyze(`
        function greet(name) {
          return "Hello, " + name;
        }
      `);
      expect(mod.actions).toHaveLength(1);
      const act = mod.actions[0];
      expect(act.type).toBe("Action");
      expect(act.name).toBe("greet");
    });

    it("should extract multiple functions as multiple ACTIONs", () => {
      const mod = analyze(`
        function foo() {}
        function bar() {}
        function baz() {}
      `);
      expect(mod.actions).toHaveLength(3);
      expect(mod.actions[0].name).toBe("foo");
      expect(mod.actions[1].name).toBe("bar");
      expect(mod.actions[2].name).toBe("baz");
    });

    it("should handle function parameters without type annotations", () => {
      const act = firstAction(`
        function add(a, b) {
          return a + b;
        }
      `);
      expect(act.params).toHaveLength(2);
      expect(act.params[0].name).toBe("a");
      // Without type annotations, ts-morph defaults to Void
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Void",
      });
    });
  });

  // ---- Control flow mapping -----------------------------------------------

  describe("control flow mapping", () => {
    it("should map if/else to WHEN/OTHERWISE", () => {
      const act = firstAction(`
        function check(x) {
          if (x > 0) {
            return "positive";
          } else {
            return "non-positive";
          }
        }
      `);
      expect(act.body.length).toBeGreaterThanOrEqual(1);
      expect(act.body[0].type).toBe("When");
      const whenNode = act.body[0] as WhenNode;
      expect(whenNode.condition).toBe("x > 0");
      expect(whenNode.otherwise).toBeDefined();
      expect(whenNode.otherwise).toHaveLength(1);
    });

    it("should map return to RETURN", () => {
      const act = firstAction(`
        function getValue() {
          return "hello";
        }
      `);
      expect(act.body).toHaveLength(1);
      const retNode = act.body[0] as ReturnNode;
      expect(retNode.type).toBe("Return");
      expect(retNode.value).toBe('"hello"');
    });

    it("should map throw new Error to FAIL", () => {
      const act = firstAction(`
        function validate(x) {
          throw new Error("Invalid input");
        }
      `);
      expect(act.body).toHaveLength(1);
      expect(act.body[0].type).toBe("Fail");
    });
  });

  // ---- Determinism --------------------------------------------------------

  describe("determinism", () => {
    it("should produce identical output for identical input", () => {
      const source = `
        function register(email, password) {
          if (!email) {
            throw new Error("Email is required");
          }
          const hashed = hash(password);
          return hashed;
        }
      `;

      const result1 = analyze(source);
      const result2 = analyze(source);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // ---- State access detection -> STATE ------------------------------------

  describe("state access detection", () => {
    it("should detect db.find() as STATE READS in JS", () => {
      const mod = analyze(`
        function getUser() {
          const user = db.findById("123");
        }
      `);
      expect(mod.state).toBeDefined();
      const readFields = mod.state!.fields.filter((f) => f.access === "READS");
      expect(readFields).toHaveLength(1);
      expect(readFields[0].name).toBe("db");
    });
  });
});
