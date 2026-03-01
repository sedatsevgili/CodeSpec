import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  banner: {
    js: "#!/usr/bin/env node",
  },
  onSuccess: async () => {
    // Copy the Peggy grammar file next to the built output so the parser
    // wrapper can locate it at runtime via import.meta.url resolution.
    mkdirSync("dist", { recursive: true });
    copyFileSync("src/parser/grammar.peggy", "dist/grammar.peggy");
  },
});
