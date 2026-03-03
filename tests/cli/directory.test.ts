import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalyzeCommand } from "../../src/cli/commands/analyze.js";
import { createGenerateCommand } from "../../src/cli/commands/generate.js";

// ---- Helpers ----------------------------------------------------------------

let tempDir: string;
let savedExitCode: number | undefined;

function makeTempDir(): string {
  const dir = join(tmpdir(), `codespec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tempDir = makeTempDir();
  savedExitCode = process.exitCode;
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  process.exitCode = savedExitCode;
});

// ---- Analyze directory tests ------------------------------------------------

describe("analyze command — directory support", () => {
  it("should analyze all source files in a directory", async () => {
    // Create a directory with two TS files
    writeFileSync(
      join(tempDir, "add.ts"),
      'export function add(a: number, b: number): number { return a + b; }',
    );
    writeFileSync(
      join(tempDir, "greet.ts"),
      'export function greet(name: string): string { return `Hello ${name}`; }',
    );

    const outDir = join(tempDir, "specs");
    const cmd = createAnalyzeCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--out", outDir]);

    expect(existsSync(join(outDir, "add.spec.md"))).toBe(true);
    expect(existsSync(join(outDir, "greet.spec.md"))).toBe(true);
  });

  it("should preserve subdirectory structure in output", async () => {
    const subDir = join(tempDir, "auth");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "login.ts"),
      'export function login(user: string): boolean { return true; }',
    );

    const outDir = join(tempDir, "specs");
    const cmd = createAnalyzeCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--out", outDir]);

    expect(existsSync(join(outDir, "auth", "login.spec.md"))).toBe(true);
  });

  it("should skip test files", async () => {
    writeFileSync(
      join(tempDir, "utils.ts"),
      'export function id(x: number): number { return x; }',
    );
    writeFileSync(
      join(tempDir, "utils.test.ts"),
      'import { id } from "./utils"; test("id", () => expect(id(1)).toBe(1));',
    );

    const outDir = join(tempDir, "specs");
    const cmd = createAnalyzeCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--out", outDir]);

    expect(existsSync(join(outDir, "utils.spec.md"))).toBe(true);
    expect(existsSync(join(outDir, "utils.test.spec.md"))).toBe(false);
  });

  it("should still work for a single file argument", async () => {
    const filePath = join(tempDir, "single.ts");
    writeFileSync(filePath, 'export function noop(): void {}');

    const outDir = join(tempDir, "specs");
    const cmd = createAnalyzeCommand();
    await cmd.parseAsync(["node", "test", filePath, "--out", outDir]);

    expect(existsSync(join(outDir, "single.spec.md"))).toBe(true);
  });
});

// ---- Generate directory tests -----------------------------------------------

describe("generate command — directory support", () => {
  /** Create a minimal valid .spec.md file. */
  function writeSpec(path: string, moduleName: string): void {
    const content = [
      "# Spec",
      "",
      "```codespec",
      `MODULE ${moduleName} {`,
      `  ACTION run() -> Void {`,
      `    RETURN Void`,
      `  }`,
      "}",
      "```",
    ].join("\n");
    writeFileSync(path, content);
  }

  it("should generate code from all .spec.md files in a directory", async () => {
    writeSpec(join(tempDir, "alpha.spec.md"), "Alpha");
    writeSpec(join(tempDir, "beta.spec.md"), "Beta");

    const outDir = join(tempDir, "generated");
    const cmd = createGenerateCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--target", "ts", "--out", outDir]);

    expect(existsSync(join(outDir, "alpha.ts"))).toBe(true);
    expect(existsSync(join(outDir, "beta.ts"))).toBe(true);
  });

  it("should preserve subdirectory structure in output", async () => {
    const subDir = join(tempDir, "models");
    mkdirSync(subDir, { recursive: true });
    writeSpec(join(subDir, "user.spec.md"), "User");

    const outDir = join(tempDir, "generated");
    const cmd = createGenerateCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--target", "ts", "--out", outDir]);

    expect(existsSync(join(outDir, "models", "user.ts"))).toBe(true);
  });

  it("should ignore non-spec .md files", async () => {
    writeSpec(join(tempDir, "real.spec.md"), "Real");
    writeFileSync(join(tempDir, "README.md"), "# Not a spec");

    const outDir = join(tempDir, "generated");
    const cmd = createGenerateCommand();
    await cmd.parseAsync(["node", "test", tempDir, "--target", "ts", "--out", outDir]);

    expect(existsSync(join(outDir, "real.ts"))).toBe(true);
    // README.md should not produce output
    const files = require("fs").readdirSync(outDir);
    expect(files).toHaveLength(1);
  });

  it("should still work for a single file argument", async () => {
    const specPath = join(tempDir, "single.spec.md");
    writeSpec(specPath, "Single");

    const outDir = join(tempDir, "generated");
    const cmd = createGenerateCommand();
    await cmd.parseAsync(["node", "test", specPath, "--target", "ts", "--out", outDir]);

    expect(existsSync(join(outDir, "single.ts"))).toBe(true);
  });
});
