import { describe, it, expect } from "vitest";
import {
  extractCodeSpecBlocks,
  wrapInMarkdown,
} from "../../src/serializer/markdown.js";

// ---------------------------------------------------------------------------
// extractCodeSpecBlocks
// ---------------------------------------------------------------------------

describe("extractCodeSpecBlocks", () => {
  it("should extract a single codespec block", () => {
    const md = `# My Spec

\`\`\`codespec
MODULE Test {}
\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("MODULE Test {}\n");
  });

  it("should extract multiple codespec blocks", () => {
    const md = `# Specs

\`\`\`codespec
MODULE First {}
\`\`\`

Some text in between.

\`\`\`codespec
MODULE Second {}
\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("MODULE First {}");
    expect(blocks[1]).toContain("MODULE Second {}");
  });

  it("should return empty array when no codespec blocks exist", () => {
    const md = `# Nothing here

Just regular markdown.

\`\`\`javascript
const x = 1;
\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(0);
  });

  it("should not extract blocks with different language tags", () => {
    const md = `\`\`\`typescript
const x = 1;
\`\`\`

\`\`\`codespec
MODULE Test {}
\`\`\`

\`\`\`javascript
const y = 2;
\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("MODULE Test {}");
  });

  it("should handle blocks with leading whitespace on fences", () => {
    const md = `  \`\`\`codespec
MODULE Test {}
  \`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("MODULE Test {}");
  });

  it("should handle multiline codespec content", () => {
    const md = `\`\`\`codespec
MODULE Test {
  INPUT {
    name: String
  }
}
\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("MODULE Test {");
    expect(blocks[0]).toContain("INPUT {");
    expect(blocks[0]).toContain("name: String");
  });

  it("should handle blocks with more than three backticks", () => {
    const md = `\`\`\`\`codespec
MODULE Test {}
\`\`\`\`
`;
    const blocks = extractCodeSpecBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("MODULE Test {}");
  });
});

// ---------------------------------------------------------------------------
// wrapInMarkdown
// ---------------------------------------------------------------------------

describe("wrapInMarkdown", () => {
  it("should wrap codespec text in a markdown document", () => {
    const result = wrapInMarkdown("MODULE Test {}\n", "Test Spec");
    expect(result).toContain("# Test Spec");
    expect(result).toContain("```codespec");
    expect(result).toContain("MODULE Test {}");
    expect(result).toContain("```");
  });

  it("should produce a document with proper structure", () => {
    const result = wrapInMarkdown("MODULE Test {}\n", "My Module");
    const lines = result.split("\n");
    expect(lines[0]).toBe("# My Module");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("```codespec");
    expect(lines[lines.length - 2]).toBe("```");
    expect(lines[lines.length - 1]).toBe("");
  });

  it("should handle multiline codespec text", () => {
    const spec = `MODULE Test {
  INPUT {
    name: String
  }
}
`;
    const result = wrapInMarkdown(spec, "Test");
    expect(result).toContain("```codespec");
    expect(result).toContain("MODULE Test {");
    expect(result).toContain("  INPUT {");
  });

  it("should strip trailing newline from spec text before closing fence", () => {
    const result = wrapInMarkdown("MODULE Test {}\n", "Test");
    // The closing ``` should be on its own line immediately after content
    expect(result).not.toContain("MODULE Test {}\n\n```");
    expect(result).toContain("MODULE Test {}\n```");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: wrapInMarkdown -> extractCodeSpecBlocks
// ---------------------------------------------------------------------------

describe("markdown round-trip: wrap -> extract", () => {
  it("should recover the original codespec text", () => {
    const original = "MODULE Test {\n  INPUT {\n    name: String\n  }\n}";
    const markdown = wrapInMarkdown(original + "\n", "Test Spec");
    const blocks = extractCodeSpecBlocks(markdown);
    expect(blocks).toHaveLength(1);
    // The extracted block should contain the original text
    expect(blocks[0].trim()).toBe(original);
  });
});
