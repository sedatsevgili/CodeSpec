import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** CodeSpec configuration schema. */
export interface CodeSpecConfig {
  readonly languages: readonly string[];
  readonly output_dir: string;
  readonly analyze: {
    readonly include: readonly string[];
    readonly exclude: readonly string[];
  };
  readonly generate: {
    readonly style: string;
    readonly target_dir: string;
  };
}

const DEFAULT_CONFIG: CodeSpecConfig = {
  languages: ["typescript", "javascript", "php"],
  output_dir: "./specs",
  analyze: {
    include: ["src/**/*"],
    exclude: ["**/*.test.*", "**/*.spec.*", "**/node_modules/**"],
  },
  generate: {
    style: "functional",
    target_dir: "./generated",
  },
};

/** Loads .codespecrc.json from the given directory, falling back to defaults. */
export async function loadConfig(dir: string): Promise<CodeSpecConfig> {
  try {
    const raw = await readFile(join(dir, ".codespecrc.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...(parsed as Partial<CodeSpecConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}
