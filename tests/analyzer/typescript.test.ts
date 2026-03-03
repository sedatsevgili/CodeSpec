import { describe, it, expect } from "vitest";
import { analyzeTypeScriptSource } from "../../src/analyzer/typescript.js";
import type {
  ActionNode,
  WhenNode,
  MatchNode,
  FailNode,
  ReturnNode,
  CallNode,
  SetNode,
  EmitNode,
} from "../../src/ast/nodes.js";

// ---- Helpers --------------------------------------------------------------

/** Shorthand to analyze source and return the module. */
function analyze(source: string, fileName?: string) {
  return analyzeTypeScriptSource(source, fileName ?? "test.ts");
}

/** Get the first action from analyzed source. */
function firstAction(source: string): ActionNode {
  const mod = analyze(source);
  expect(mod.actions.length).toBeGreaterThan(0);
  return mod.actions[0];
}

// ---- Tests ----------------------------------------------------------------

describe("TypeScript Analyzer", () => {
  // ---- Module name derivation ---------------------------------------------

  describe("module name derivation", () => {
    it("should derive PascalCase module name from file name", () => {
      const mod = analyze("export function foo() {}", "user-service.ts");
      expect(mod.name).toBe("UserService");
    });

    it("should handle camelCase file names", () => {
      const mod = analyze("export function foo() {}", "userService.ts");
      expect(mod.name).toBe("UserService");
    });

    it("should handle simple file names", () => {
      const mod = analyze("export function foo() {}", "module.ts");
      expect(mod.name).toBe("Module");
    });

    it("should handle underscore-separated file names", () => {
      const mod = analyze("export function foo() {}", "user_service.ts");
      expect(mod.name).toBe("UserService");
    });
  });

  // ---- Basic function extraction -> ACTION --------------------------------

  describe("function extraction -> ACTION", () => {
    it("should extract a basic function as an ACTION", () => {
      const mod = analyze(`
        export function greet(name: string): string {
          return "Hello, " + name;
        }
      `);
      expect(mod.actions).toHaveLength(1);
      const act = mod.actions[0];
      expect(act.type).toBe("Action");
      expect(act.name).toBe("greet");
    });

    it("should extract function parameters with types", () => {
      const act = firstAction(`
        function add(a: number, b: number): number {
          return a + b;
        }
      `);
      expect(act.params).toHaveLength(2);
      expect(act.params[0].name).toBe("a");
      expect(act.params[0].paramType).toEqual({ kind: "primitive", name: "Int" });
      expect(act.params[1].name).toBe("b");
      expect(act.params[1].paramType).toEqual({ kind: "primitive", name: "Int" });
    });

    it("should map return type correctly", () => {
      const act = firstAction(`
        function getValue(): string {
          return "hello";
        }
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "String" });
    });

    it("should handle void return type", () => {
      const act = firstAction(`
        function doNothing(): void {}
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "Void" });
    });

    it("should handle functions without explicit return type", () => {
      const act = firstAction(`
        function doSomething() {}
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "Void" });
    });

    it("should extract multiple functions as multiple ACTIONs", () => {
      const mod = analyze(`
        function foo(): void {}
        function bar(): void {}
        function baz(): void {}
      `);
      expect(mod.actions).toHaveLength(3);
      expect(mod.actions[0].name).toBe("foo");
      expect(mod.actions[1].name).toBe("bar");
      expect(mod.actions[2].name).toBe("baz");
    });

    it("should extract optional parameters", () => {
      const act = firstAction(`
        function greet(name: string, title?: string): string {
          return name;
        }
      `);
      expect(act.params).toHaveLength(2);
      expect(act.params[1].paramType).toEqual({
        kind: "optional",
        innerType: { kind: "primitive", name: "String" },
      });
    });
  });

  // ---- Interface extraction -> INPUT/OUTPUT -------------------------------

  describe("interface extraction -> INPUT/OUTPUT", () => {
    it("should classify interfaces with 'Input' in name as INPUT", () => {
      const mod = analyze(`
        export interface UserInput {
          email: string;
          password: string;
        }
      `);
      expect(mod.input).toBeDefined();
      expect(mod.input!.fields).toHaveLength(2);
      expect(mod.input!.fields[0].name).toBe("email");
      expect(mod.input!.fields[0].fieldType).toEqual({
        kind: "primitive",
        name: "String",
      });
    });

    it("should classify interfaces with 'Request' in name as INPUT", () => {
      const mod = analyze(`
        export interface CreateUserRequest {
          name: string;
          age: number;
        }
      `);
      expect(mod.input).toBeDefined();
      expect(mod.input!.fields).toHaveLength(2);
    });

    it("should classify interfaces with 'Output' in name as OUTPUT", () => {
      const mod = analyze(`
        export interface UserOutput {
          id: string;
          name: string;
        }
      `);
      expect(mod.output).toBeDefined();
      expect(mod.output!.fields).toHaveLength(2);
    });

    it("should classify interfaces with 'Response' in name as OUTPUT", () => {
      const mod = analyze(`
        export interface ApiResponse {
          data: string;
          status: number;
        }
      `);
      expect(mod.output).toBeDefined();
    });

    it("should default exported interfaces to OUTPUT", () => {
      const mod = analyze(`
        export interface User {
          id: string;
          name: string;
        }
      `);
      expect(mod.output).toBeDefined();
      expect(mod.output!.fields).toHaveLength(2);
    });

    it("should skip non-exported interfaces", () => {
      const mod = analyze(`
        interface InternalConfig {
          debug: boolean;
        }
      `);
      expect(mod.input).toBeUndefined();
      expect(mod.output).toBeUndefined();
    });

    it("should handle optional properties in interfaces", () => {
      const mod = analyze(`
        export interface UserInput {
          name: string;
          nickname?: string;
        }
      `);
      expect(mod.input).toBeDefined();
      expect(mod.input!.fields[1].fieldType).toEqual({
        kind: "optional",
        innerType: { kind: "primitive", name: "String" },
      });
    });
  });

  // ---- Type mapping -------------------------------------------------------

  describe("type mapping", () => {
    it("should map string to String", () => {
      const act = firstAction(`function f(x: string): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "String",
      });
    });

    it("should map number to Int", () => {
      const act = firstAction(`function f(x: number): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Int",
      });
    });

    it("should map boolean to Bool", () => {
      const act = firstAction(`function f(x: boolean): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Bool",
      });
    });

    it("should map Date to DateTime", () => {
      const act = firstAction(`function f(x: Date): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "DateTime",
      });
    });

    it("should map Array<T> to List<T>", () => {
      const act = firstAction(`function f(x: Array<string>): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "list",
        elementType: { kind: "primitive", name: "String" },
      });
    });

    it("should map T[] to List<T>", () => {
      const act = firstAction(`function f(x: string[]): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "list",
        elementType: { kind: "primitive", name: "String" },
      });
    });

    it("should map Map<K, V> to Map<K, V>", () => {
      const act = firstAction(`function f(x: Map<string, number>): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "map",
        keyType: { kind: "primitive", name: "String" },
        valueType: { kind: "primitive", name: "Int" },
      });
    });

    it("should map Promise<T> to just T (unwrap)", () => {
      const act = firstAction(`function f(): Promise<string> { return Promise.resolve(""); }`);
      expect(act.returnType).toEqual({
        kind: "primitive",
        name: "String",
      });
    });

    it("should map custom types to NamedType", () => {
      const act = firstAction(`function f(x: MyCustomType): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "named",
        name: "MyCustomType",
      });
    });

    it("should map T | undefined to Optional<T>", () => {
      const act = firstAction(`function f(x: string | undefined): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "optional",
        innerType: { kind: "primitive", name: "String" },
      });
    });

    it("should map void to Void", () => {
      const act = firstAction(`function f(): void {}`);
      expect(act.returnType).toEqual({
        kind: "primitive",
        name: "Void",
      });
    });
  });

  // ---- Control flow mapping -----------------------------------------------

  describe("control flow mapping", () => {
    describe("if/else -> WHEN/OTHERWISE", () => {
      it("should map if statement to WHEN", () => {
        const act = firstAction(`
          function check(x: number): string {
            if (x > 0) {
              return "positive";
            }
            return "non-positive";
          }
        `);
        expect(act.body).toHaveLength(2);
        expect(act.body[0].type).toBe("When");
        const whenNode = act.body[0] as WhenNode;
        expect(whenNode.condition).toBe("x > 0");
        expect(whenNode.body).toHaveLength(1);
        expect(whenNode.body[0].type).toBe("Return");
      });

      it("should map if/else to WHEN/OTHERWISE", () => {
        const act = firstAction(`
          function check(x: number): string {
            if (x > 0) {
              return "positive";
            } else {
              return "non-positive";
            }
          }
        `);
        const whenNode = act.body[0] as WhenNode;
        expect(whenNode.type).toBe("When");
        expect(whenNode.otherwise).toBeDefined();
        expect(whenNode.otherwise).toHaveLength(1);
        expect((whenNode.otherwise![0] as ReturnNode).value).toBe('"non-positive"');
      });

      it("should handle nested if/else", () => {
        const act = firstAction(`
          function classify(x: number): string {
            if (x > 0) {
              return "positive";
            } else {
              if (x < 0) {
                return "negative";
              } else {
                return "zero";
              }
            }
          }
        `);
        const whenNode = act.body[0] as WhenNode;
        expect(whenNode.type).toBe("When");
        expect(whenNode.otherwise).toBeDefined();
        // The else branch contains a nested WHEN
        expect(whenNode.otherwise![0].type).toBe("When");
      });
    });

    describe("switch -> MATCH", () => {
      it("should map switch statement to MATCH", () => {
        const act = firstAction(`
          function describe(role: string): string {
            switch (role) {
              case "admin":
                return "Administrator";
              case "user":
                return "Regular User";
              default:
                return "Unknown";
            }
          }
        `);
        expect(act.body).toHaveLength(1);
        const matchNode = act.body[0] as MatchNode;
        expect(matchNode.type).toBe("Match");
        expect(matchNode.subject).toBe("role");
        expect(matchNode.arms).toHaveLength(3);
        expect(matchNode.arms[0].pattern).toBe("admin");
        expect(matchNode.arms[1].pattern).toBe("user");
        expect(matchNode.arms[2].pattern).toBe("_");
      });
    });

    describe("throw -> FAIL", () => {
      it("should map throw new Error to FAIL", () => {
        const act = firstAction(`
          function validate(x: number): void {
            throw new ValidationError("Invalid input");
          }
        `);
        expect(act.body).toHaveLength(1);
        const failNode = act.body[0] as FailNode;
        expect(failNode.type).toBe("Fail");
        expect(failNode.error).toBe("ValidationError");
        expect(failNode.message).toBe("Invalid input");
      });

      it("should handle throw new Error without message", () => {
        const act = firstAction(`
          function fail(): void {
            throw new Error();
          }
        `);
        const failNode = act.body[0] as FailNode;
        expect(failNode.error).toBe("Error");
        expect(failNode.message).toBeUndefined();
      });
    });

    describe("return -> RETURN", () => {
      it("should map return statement to RETURN", () => {
        const act = firstAction(`
          function getValue(): string {
            return "hello";
          }
        `);
        expect(act.body).toHaveLength(1);
        const retNode = act.body[0] as ReturnNode;
        expect(retNode.type).toBe("Return");
        expect(retNode.value).toBe('"hello"');
      });

      it("should handle return without value", () => {
        const act = firstAction(`
          function doNothing(): void {
            return;
          }
        `);
        const retNode = act.body[0] as ReturnNode;
        expect(retNode.value).toBe("void");
      });
    });
  });

  // ---- Variable declarations -> SET / CALL --------------------------------

  describe("variable declarations", () => {
    it("should map variable declaration to SET", () => {
      const act = firstAction(`
        function calc(): number {
          const x = 42;
          return x;
        }
      `);
      expect(act.body[0].type).toBe("Set");
      const setNode = act.body[0] as SetNode;
      expect(setNode.variable).toBe("x");
      expect(setNode.value).toBe("42");
    });

    it("should map variable with function call to CALL with assignTo", () => {
      const act = firstAction(`
        function process(): string {
          const result = transform(data);
          return result;
        }
      `);
      expect(act.body[0].type).toBe("Call");
      const callNode = act.body[0] as CallNode;
      expect(callNode.target).toBe("transform");
      expect(callNode.args).toEqual(["data"]);
      expect(callNode.assignTo).toBe("result");
    });

    it("should map variable with method call to CALL with assignTo", () => {
      const act = firstAction(`
        function process(): string {
          const user = db.findById(userId);
          return user;
        }
      `);
      expect(act.body[0].type).toBe("Call");
      const callNode = act.body[0] as CallNode;
      expect(callNode.target).toBe("db.findById");
      expect(callNode.assignTo).toBe("user");
    });

    it("should map await expression with call to CALL", () => {
      const act = firstAction(`
        async function process(): Promise<string> {
          const result = await fetchData(url);
          return result;
        }
      `);
      expect(act.body[0].type).toBe("Call");
      const callNode = act.body[0] as CallNode;
      expect(callNode.target).toBe("fetchData");
      expect(callNode.assignTo).toBe("result");
    });
  });

  // ---- Import detection -> DEPENDS ----------------------------------------

  describe("import detection -> DEPENDS", () => {
    it("should detect external package imports as dependencies", () => {
      const mod = analyze(`
        import { hash } from "bcrypt";
        import express from "express";

        export function process(): void {}
      `);
      expect(mod.depends).toBeDefined();
      expect(mod.depends!.dependencies).toHaveLength(2);
      const names = mod.depends!.dependencies.map((d) => d.name);
      expect(names).toContain("bcrypt");
      expect(names).toContain("express");
    });

    it("should detect scoped package imports", () => {
      const mod = analyze(`
        import { Injectable } from "@nestjs/common";

        export function process(): void {}
      `);
      expect(mod.depends).toBeDefined();
      expect(mod.depends!.dependencies[0].name).toBe("@nestjs/common");
    });

    it("should skip relative imports", () => {
      const mod = analyze(`
        import { helper } from "./utils";
        import { config } from "../config";

        export function process(): void {}
      `);
      expect(mod.depends).toBeUndefined();
    });

    it("should sort dependencies alphabetically for determinism", () => {
      const mod = analyze(`
        import z from "zod";
        import a from "axios";
        import m from "moment";

        export function process(): void {}
      `);
      expect(mod.depends).toBeDefined();
      const names = mod.depends!.dependencies.map((d) => d.name);
      expect(names).toEqual(["axios", "moment", "zod"]);
    });
  });

  // ---- Event emitter calls -> EMIT ----------------------------------------

  describe("event emitter calls -> EMIT", () => {
    it("should detect obj.emit() as EMIT", () => {
      const act = firstAction(`
        function notify(): void {
          eventBus.emit("UserCreated", { userId: 123 });
        }
      `);
      expect(act.body).toHaveLength(1);
      const emitNode = act.body[0] as EmitNode;
      expect(emitNode.type).toBe("Emit");
      expect(emitNode.event).toBe("UserCreated");
      expect(emitNode.payload).toBe("{ userId: 123 }");
    });

    it("should detect dispatch() as EMIT", () => {
      const act = firstAction(`
        function notify(): void {
          dispatch("OrderPlaced", order);
        }
      `);
      expect(act.body[0].type).toBe("Emit");
      const emitNode = act.body[0] as EmitNode;
      expect(emitNode.event).toBe("OrderPlaced");
      expect(emitNode.payload).toBe("order");
    });

    it("should handle emit without payload", () => {
      const act = firstAction(`
        function notify(): void {
          events.emit("SystemReady");
        }
      `);
      const emitNode = act.body[0] as EmitNode;
      expect(emitNode.type).toBe("Emit");
      expect(emitNode.event).toBe("SystemReady");
      expect(emitNode.payload).toBeUndefined();
    });
  });

  // ---- State access detection -> STATE ------------------------------------

  describe("state access detection -> STATE", () => {
    it("should detect db.find() as STATE READS", () => {
      const mod = analyze(`
        function getUser(): void {
          const user = db.findById("123");
        }
      `);
      expect(mod.state).toBeDefined();
      expect(mod.state!.fields.length).toBeGreaterThan(0);
      const readFields = mod.state!.fields.filter((f) => f.access === "READS");
      expect(readFields).toHaveLength(1);
      expect(readFields[0].name).toBe("db");
    });

    it("should detect store.save() as STATE WRITES", () => {
      const mod = analyze(`
        function saveUser(): void {
          store.save(user);
        }
      `);
      expect(mod.state).toBeDefined();
      const writeFields = mod.state!.fields.filter((f) => f.access === "WRITES");
      expect(writeFields).toHaveLength(1);
      expect(writeFields[0].name).toBe("store");
    });

    it("should detect both READS and WRITES", () => {
      const mod = analyze(`
        function updateUser(): void {
          const user = db.findById("123");
          db.save(user);
        }
      `);
      expect(mod.state).toBeDefined();
      const reads = mod.state!.fields.filter((f) => f.access === "READS");
      const writes = mod.state!.fields.filter((f) => f.access === "WRITES");
      expect(reads).toHaveLength(1);
      expect(writes).toHaveLength(1);
    });
  });

  // ---- Class method extraction -> ACTION ----------------------------------

  describe("class method extraction -> ACTION", () => {
    it("should extract class methods as ACTIONs", () => {
      const mod = analyze(`
        class UserService {
          getUser(id: string): string {
            return id;
          }

          createUser(name: string): void {
            console.log(name);
          }
        }
      `);
      expect(mod.actions).toHaveLength(2);
      expect(mod.actions[0].name).toBe("getUser");
      expect(mod.actions[1].name).toBe("createUser");
    });
  });

  // ---- Try/catch handling -------------------------------------------------

  describe("try/catch handling", () => {
    it("should extract try body and wrap catch in WHEN", () => {
      const act = firstAction(`
        function process(): void {
          try {
            const result = doWork();
          } catch (err) {
            throw new ProcessingError("Failed to process");
          }
        }
      `);
      // Try body is extracted as statements
      expect(act.body.length).toBeGreaterThanOrEqual(1);
      // A WHEN node should be present for the catch clause
      const whenNodes = act.body.filter((s) => s.type === "When");
      expect(whenNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Determinism --------------------------------------------------------

  describe("determinism", () => {
    it("should produce identical output for identical input", () => {
      const source = `
        import { hash } from "bcrypt";
        import { validate } from "class-validator";

        export interface UserInput {
          email: string;
          password: string;
        }

        export interface UserOutput {
          id: string;
          name: string;
        }

        export function register(email: string, password: string): string {
          if (!email) {
            throw new ValidationError("Email is required");
          }
          const hashed = hash(password);
          return hashed;
        }
      `;

      const result1 = analyze(source);
      const result2 = analyze(source);

      // Deep equality check
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  // ---- Type alias extraction -> INPUT/OUTPUT ------------------------------

  describe("type alias extraction", () => {
    it("should extract exported type aliases with object types as INPUT/OUTPUT", () => {
      const mod = analyze(`
        export type UserInput = {
          name: string;
          email: string;
        };
      `);
      expect(mod.input).toBeDefined();
      expect(mod.input!.fields).toHaveLength(2);
    });

    it("should skip non-exported type aliases", () => {
      const mod = analyze(`
        type InternalConfig = {
          debug: boolean;
        };
      `);
      expect(mod.input).toBeUndefined();
      expect(mod.output).toBeUndefined();
    });
  });
});
