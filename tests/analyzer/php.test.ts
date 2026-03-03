import { describe, it, expect } from "vitest";
import { analyzePhpSource } from "../../src/analyzer/php.js";
import type {
  ActionNode,
  WhenNode,
  MatchNode,
  FailNode,
  ReturnNode,
  CallNode,
  SetNode,
} from "../../src/ast/nodes.js";

// ---- Helpers --------------------------------------------------------------

/** Shorthand to analyze PHP source and return the module. */
function analyze(source: string, fileName?: string) {
  return analyzePhpSource(source, fileName ?? "test.php");
}

/** Get the first action from analyzed PHP source. */
function firstAction(source: string): ActionNode {
  const mod = analyze(source);
  expect(mod.actions.length).toBeGreaterThan(0);
  return mod.actions[0];
}

// ---- Tests ----------------------------------------------------------------

describe("PHP Analyzer", () => {
  // ---- Module name derivation ---------------------------------------------

  describe("module name derivation", () => {
    it("should derive PascalCase module name from file name", () => {
      const mod = analyze("<?php function foo() {}", "user-service.php");
      expect(mod.name).toBe("UserService");
    });

    it("should handle PascalCase file names", () => {
      const mod = analyze("<?php function foo() {}", "UserController.php");
      expect(mod.name).toBe("UserController");
    });

    it("should handle underscore-separated file names", () => {
      const mod = analyze("<?php function foo() {}", "user_service.php");
      expect(mod.name).toBe("UserService");
    });

    it("should default to Module for module.php", () => {
      const mod = analyzePhpSource("<?php function foo() {}");
      expect(mod.name).toBe("Module");
    });
  });

  // ---- Basic function extraction -> ACTION --------------------------------

  describe("function extraction -> ACTION", () => {
    it("should extract a basic PHP function as an ACTION", () => {
      const mod = analyze(`<?php
        function greet(string $name): string {
          return "Hello, " . $name;
        }
      `);
      expect(mod.actions).toHaveLength(1);
      const act = mod.actions[0];
      expect(act.type).toBe("Action");
      expect(act.name).toBe("greet");
    });

    it("should extract function parameters with types", () => {
      const act = firstAction(`<?php
        function add(int $a, int $b): int {
          return $a + $b;
        }
      `);
      expect(act.params).toHaveLength(2);
      expect(act.params[0].name).toBe("a");
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Int",
      });
      expect(act.params[1].name).toBe("b");
      expect(act.params[1].paramType).toEqual({
        kind: "primitive",
        name: "Int",
      });
    });

    it("should map PHP return type correctly", () => {
      const act = firstAction(`<?php
        function getValue(): string {
          return "hello";
        }
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "String" });
    });

    it("should handle void return type", () => {
      const act = firstAction(`<?php
        function doNothing(): void {}
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "Void" });
    });

    it("should handle functions without explicit return type", () => {
      const act = firstAction(`<?php
        function doSomething() {}
      `);
      expect(act.returnType).toEqual({ kind: "primitive", name: "Void" });
    });

    it("should extract multiple functions as multiple ACTIONs", () => {
      const mod = analyze(`<?php
        function foo(): void {}
        function bar(): void {}
        function baz(): void {}
      `);
      expect(mod.actions).toHaveLength(3);
      expect(mod.actions[0].name).toBe("foo");
      expect(mod.actions[1].name).toBe("bar");
      expect(mod.actions[2].name).toBe("baz");
    });

    it("should extract nullable parameters", () => {
      const act = firstAction(`<?php
        function greet(string $name, ?string $title): string {
          return $name;
        }
      `);
      expect(act.params).toHaveLength(2);
      expect(act.params[1].paramType).toEqual({
        kind: "optional",
        innerType: { kind: "primitive", name: "String" },
      });
    });
  });

  // ---- Type mapping -------------------------------------------------------

  describe("type mapping", () => {
    it("should map string to String", () => {
      const act = firstAction(`<?php function f(string $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "String",
      });
    });

    it("should map int to Int", () => {
      const act = firstAction(`<?php function f(int $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Int",
      });
    });

    it("should map float to Float", () => {
      const act = firstAction(`<?php function f(float $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Float",
      });
    });

    it("should map bool to Bool", () => {
      const act = firstAction(`<?php function f(bool $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "Bool",
      });
    });

    it("should map array to List<String>", () => {
      const act = firstAction(`<?php function f(array $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "list",
        elementType: { kind: "primitive", name: "String" },
      });
    });

    it("should map DateTime to DateTime", () => {
      const act = firstAction(`<?php function f(DateTime $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "primitive",
        name: "DateTime",
      });
    });

    it("should map nullable type to Optional", () => {
      const act = firstAction(`<?php function f(?string $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "optional",
        innerType: { kind: "primitive", name: "String" },
      });
    });

    it("should map custom types to NamedType", () => {
      const act = firstAction(`<?php function f(MyCustomType $x): void {}`);
      expect(act.params[0].paramType).toEqual({
        kind: "named",
        name: "MyCustomType",
      });
    });
  });

  // ---- Control flow mapping -----------------------------------------------

  describe("control flow mapping", () => {
    describe("if/else -> WHEN/OTHERWISE", () => {
      it("should map if statement to WHEN", () => {
        const act = firstAction(`<?php
          function check(int $x): string {
            if ($x > 0) {
              return "positive";
            }
            return "non-positive";
          }
        `);
        expect(act.body).toHaveLength(2);
        expect(act.body[0].type).toBe("When");
        const whenNode = act.body[0] as WhenNode;
        expect(whenNode.condition).toContain("x");
        expect(whenNode.body).toHaveLength(1);
        expect(whenNode.body[0].type).toBe("Return");
      });

      it("should map if/else to WHEN/OTHERWISE", () => {
        const act = firstAction(`<?php
          function check(int $x): string {
            if ($x > 0) {
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
      });

      it("should handle elseif chains", () => {
        const act = firstAction(`<?php
          function classify(int $x): string {
            if ($x > 0) {
              return "positive";
            } elseif ($x < 0) {
              return "negative";
            } else {
              return "zero";
            }
          }
        `);
        const whenNode = act.body[0] as WhenNode;
        expect(whenNode.type).toBe("When");
        expect(whenNode.otherwise).toBeDefined();
        // The elseif produces a nested WHEN in the otherwise branch
        expect(whenNode.otherwise![0].type).toBe("When");
      });
    });

    describe("switch -> MATCH", () => {
      it("should map switch statement to MATCH", () => {
        const act = firstAction(`<?php
          function describe(string $role): string {
            switch ($role) {
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
        expect(matchNode.arms).toHaveLength(3);
        expect(matchNode.arms[0].pattern).toBe("admin");
        expect(matchNode.arms[1].pattern).toBe("user");
        expect(matchNode.arms[2].pattern).toBe("_");
      });
    });

    describe("throw -> FAIL", () => {
      it("should map throw new Exception to FAIL", () => {
        const act = firstAction(`<?php
          function validate(int $x): void {
            throw new ValidationException("Invalid input");
          }
        `);
        expect(act.body).toHaveLength(1);
        const failNode = act.body[0] as FailNode;
        expect(failNode.type).toBe("Fail");
        expect(failNode.error).toBe("ValidationException");
        expect(failNode.message).toBe("Invalid input");
      });

      it("should handle throw new Exception without message", () => {
        const act = firstAction(`<?php
          function fail(): void {
            throw new RuntimeException();
          }
        `);
        const failNode = act.body[0] as FailNode;
        expect(failNode.error).toBe("RuntimeException");
        expect(failNode.message).toBeUndefined();
      });
    });

    describe("return -> RETURN", () => {
      it("should map return statement to RETURN", () => {
        const act = firstAction(`<?php
          function getValue(): string {
            return "hello";
          }
        `);
        expect(act.body).toHaveLength(1);
        const retNode = act.body[0] as ReturnNode;
        expect(retNode.type).toBe("Return");
        expect(retNode.value).toContain("hello");
      });

      it("should handle return without value", () => {
        const act = firstAction(`<?php
          function doNothing(): void {
            return;
          }
        `);
        const retNode = act.body[0] as ReturnNode;
        expect(retNode.value).toBe("void");
      });
    });
  });

  // ---- Variable assignments -> SET / CALL ---------------------------------

  describe("variable assignments", () => {
    it("should map variable assignment to SET", () => {
      const act = firstAction(`<?php
        function calc(): int {
          $x = 42;
          return $x;
        }
      `);
      expect(act.body[0].type).toBe("Set");
      const setNode = act.body[0] as SetNode;
      expect(setNode.variable).toBe("x");
      expect(setNode.value).toBe("42");
    });

    it("should map variable with function call to CALL with assignTo", () => {
      const act = firstAction(`<?php
        function process(): string {
          $result = transform($data);
          return $result;
        }
      `);
      expect(act.body[0].type).toBe("Call");
      const callNode = act.body[0] as CallNode;
      expect(callNode.target).toBe("transform");
      expect(callNode.assignTo).toBe("result");
    });

    it("should map variable with method call to CALL with assignTo", () => {
      const act = firstAction(`<?php
        function process(): string {
          $user = $db->findById($userId);
          return $user;
        }
      `);
      expect(act.body[0].type).toBe("Call");
      const callNode = act.body[0] as CallNode;
      expect(callNode.target).toBe("db.findById");
      expect(callNode.assignTo).toBe("user");
    });
  });

  // ---- Class extraction ---------------------------------------------------

  describe("class extraction", () => {
    it("should extract class methods as ACTIONs", () => {
      const mod = analyze(`<?php
        class UserService {
          public function getUser(string $id): string {
            return $id;
          }

          public function createUser(string $name): void {
            echo $name;
          }
        }
      `);
      expect(mod.actions).toHaveLength(2);
      expect(mod.actions[0].name).toBe("getUser");
      expect(mod.actions[1].name).toBe("createUser");
    });

    it("should extract class properties as OUTPUT fields", () => {
      const mod = analyze(`<?php
        class User {
          public string $name;
          public int $age;
        }
      `);
      expect(mod.output).toBeDefined();
      expect(mod.output!.fields).toHaveLength(2);
      expect(mod.output!.fields[0].name).toBe("name");
      expect(mod.output!.fields[0].fieldType).toEqual({
        kind: "primitive",
        name: "String",
      });
      expect(mod.output!.fields[1].name).toBe("age");
      expect(mod.output!.fields[1].fieldType).toEqual({
        kind: "primitive",
        name: "Int",
      });
    });

    it("should classify classes with Input in name as INPUT", () => {
      const mod = analyze(`<?php
        class UserInput {
          public string $email;
          public string $password;
        }
      `);
      expect(mod.input).toBeDefined();
      expect(mod.input!.fields).toHaveLength(2);
    });
  });

  // ---- Use statements -> DEPENDS ------------------------------------------

  describe("use statement detection -> DEPENDS", () => {
    it("should detect use statements as dependencies", () => {
      const mod = analyze(`<?php
        use Illuminate\\Support\\Facades\\DB;
        use App\\Models\\User;

        function process(): void {}
      `);
      expect(mod.depends).toBeDefined();
      const names = mod.depends!.dependencies.map((d) => d.name);
      expect(names).toContain("Illuminate");
      expect(names).toContain("App");
    });

    it("should sort dependencies alphabetically for determinism", () => {
      const mod = analyze(`<?php
        use Zend\\Validator\\Validate;
        use App\\Models\\User;
        use Illuminate\\Support\\Facades\\DB;

        function process(): void {}
      `);
      expect(mod.depends).toBeDefined();
      const names = mod.depends!.dependencies.map((d) => d.name);
      expect(names).toEqual(["App", "Illuminate", "Zend"]);
    });
  });

  // ---- State access detection -> STATE ------------------------------------

  describe("state access detection -> STATE", () => {
    it("should detect method calls as STATE READS", () => {
      const mod = analyze(`<?php
        function getUser(): void {
          $user = $db->findById("123");
        }
      `);
      expect(mod.state).toBeDefined();
      const readFields = mod.state!.fields.filter((f) => f.access === "READS");
      expect(readFields).toHaveLength(1);
      expect(readFields[0].name).toBe("db");
    });

    it("should detect method calls as STATE WRITES", () => {
      const mod = analyze(`<?php
        function saveUser(): void {
          $store->save($user);
        }
      `);
      expect(mod.state).toBeDefined();
      const writeFields = mod.state!.fields.filter((f) => f.access === "WRITES");
      expect(writeFields).toHaveLength(1);
      expect(writeFields[0].name).toBe("store");
    });
  });

  // ---- Try/catch handling -------------------------------------------------

  describe("try/catch handling", () => {
    it("should extract try body and wrap catch in WHEN", () => {
      const act = firstAction(`<?php
        function process(): void {
          try {
            $result = doWork();
          } catch (\\Exception $e) {
            throw new ProcessingException("Failed");
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

  // ---- Namespace support --------------------------------------------------

  describe("namespace support", () => {
    it("should handle namespaced PHP files", () => {
      const mod = analyze(`<?php
        namespace App\\Services;

        use App\\Models\\User;

        class UserService {
          public function getUser(string $id): string {
            return $id;
          }
        }
      `);
      expect(mod.actions).toHaveLength(1);
      expect(mod.actions[0].name).toBe("getUser");
      expect(mod.depends).toBeDefined();
    });
  });

  // ---- Determinism --------------------------------------------------------

  describe("determinism", () => {
    it("should produce identical output for identical input", () => {
      const source = `<?php
        use Illuminate\\Support\\Facades\\DB;
        use App\\Models\\User;

        class UserService {
          public string $name;

          public function register(string $email, string $password): string {
            if (!$email) {
              throw new ValidationException("Email is required");
            }
            $hashed = hash($password);
            return $hashed;
          }
        }
      `;

      const result1 = analyze(source);
      const result2 = analyze(source);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });
});
