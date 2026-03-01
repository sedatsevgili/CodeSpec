// ---------------------------------------------------------------------------
// CodeSpec Markdown Wrapper
//
// Handles the presentation layer for .spec.md files:
//   - extractCodeSpecBlocks: Extracts CodeSpec text from fenced code blocks
//     inside a markdown document (```codespec ... ```).
//   - wrapInMarkdown: Takes raw CodeSpec text and wraps it in a markdown
//     document with a header and a fenced codespec block.
//
// The core CodeSpec language knows nothing about markdown. This module is the
// boundary between the markdown presentation format and the raw CodeSpec text
// that the parser consumes.
// ---------------------------------------------------------------------------

/**
 * Extract all CodeSpec code blocks from a markdown document.
 *
 * Finds every fenced code block with the `codespec` language tag and returns
 * the content of each block as a separate string. Blocks are returned in
 * document order.
 *
 * The fenced block delimiter must be at least three backticks. Both
 * ` ```codespec ` and ` ```codespec ` (with leading whitespace) are accepted.
 *
 * @param markdown - The full markdown document text.
 * @returns An array of CodeSpec text strings, one per fenced block found.
 */
export function extractCodeSpecBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /^[ \t]*(`{3,})codespec[ \t]*\r?\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[2]);
  }

  return blocks;
}

/**
 * Wrap raw CodeSpec text in a .spec.md markdown document.
 *
 * Produces a markdown document with:
 *   1. A level-1 heading with the given title.
 *   2. A fenced code block tagged `codespec` containing the spec text.
 *
 * @param codespecText - The raw CodeSpec language text (output of the serializer).
 * @param title - The document title for the markdown heading.
 * @returns A complete .spec.md markdown document string.
 */
export function wrapInMarkdown(codespecText: string, title: string): string {
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push("```codespec");
  // Ensure codespec text does not have a trailing newline before the closing fence
  lines.push(codespecText.replace(/\n$/, ""));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
