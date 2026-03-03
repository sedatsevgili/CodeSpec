// ---------------------------------------------------------------------------
// Multi-Language Module Merge Utility
//
// Merges multiple ModuleNode ASTs into a single ModuleNode. Useful when a
// project has multiple files analyzed separately that should be combined
// into one specification. Fully deterministic: same input, same output.
// ---------------------------------------------------------------------------

import type {
  ModuleNode,
  ModuleMember,
  InputNode,
  OutputNode,
  StateNode,
  DependsNode,
  DependencyDef,
  StateFieldNode,
  FieldNode,
} from "../ast/nodes.js";

import {
  input,
  output,
  state,
  depends,
  dependencyDef,
  module as moduleNode,
} from "../ast/builder.js";

// ---- Public API -----------------------------------------------------------

/**
 * Merge multiple CodeSpec ModuleNode ASTs into a single ModuleNode.
 *
 * Combines members from all modules, deduplicating dependencies and
 * state fields. The resulting module name is derived from the first
 * module, or "MergedModule" if no modules are provided.
 *
 * Merge rules:
 * - INPUT fields are combined (deduplicated by name, first wins)
 * - OUTPUT fields are combined (deduplicated by name, first wins)
 * - STATE fields are combined (deduplicated by name+access, first wins)
 * - ACTIONs are all included (deduplicated by name, first wins)
 * - DEPENDS are combined and deduplicated by name
 * - INVARIANTS, ERRORS, and COMMENTs are included as-is from all modules
 *
 * @param modules - The modules to merge.
 * @returns A single merged ModuleNode.
 */
export function mergeModules(modules: readonly ModuleNode[]): ModuleNode {
  if (modules.length === 0) {
    return moduleNode({ name: "MergedModule", members: [] });
  }

  if (modules.length === 1) {
    return modules[0];
  }

  const mergedName = modules[0].name;
  const members: ModuleMember[] = [];

  // ---- Merge INPUT blocks ------------------------------------------------
  const mergedInputFields = mergeFields(
    modules.filter((m) => m.input !== undefined).map((m) => m.input as InputNode),
  );
  if (mergedInputFields.length > 0) {
    members.push(input({ fields: mergedInputFields }));
  }

  // ---- Merge OUTPUT blocks -----------------------------------------------
  const mergedOutputFields = mergeFields(
    modules.filter((m) => m.output !== undefined).map((m) => m.output as OutputNode),
  );
  if (mergedOutputFields.length > 0) {
    members.push(output({ fields: mergedOutputFields }));
  }

  // ---- Merge STATE blocks ------------------------------------------------
  const mergedStateFields = mergeStateFields(
    modules.filter((m) => m.state !== undefined).map((m) => m.state as StateNode),
  );
  if (mergedStateFields.length > 0) {
    members.push(state({ fields: mergedStateFields }));
  }

  // ---- Merge ACTIONs (deduplicate by name, first wins) -------------------
  const seenActions = new Set<string>();
  for (const mod of modules) {
    for (const act of mod.actions) {
      if (!seenActions.has(act.name)) {
        seenActions.add(act.name);
        members.push(act);
      }
    }
  }

  // ---- Include INVARIANTS, ERRORS, COMMENTs as-is -------------------------
  for (const mod of modules) {
    for (const member of mod.members) {
      if (
        member.type === "Invariants" ||
        member.type === "Errors" ||
        member.type === "Comment"
      ) {
        members.push(member);
      }
    }
  }

  // ---- Merge DEPENDS (deduplicate by name) --------------------------------
  const mergedDeps = mergeDependencies(
    modules.filter((m) => m.depends !== undefined).map((m) => m.depends as DependsNode),
  );
  if (mergedDeps.length > 0) {
    members.push(depends({ dependencies: mergedDeps }));
  }

  return moduleNode({ name: mergedName, members });
}

// ---- Field merging helpers ------------------------------------------------

/**
 * Merge fields from multiple INPUT or OUTPUT blocks, deduplicating by name.
 * First occurrence wins.
 */
function mergeFields(
  blocks: readonly (InputNode | OutputNode)[],
): readonly FieldNode[] {
  const seen = new Set<string>();
  const result: FieldNode[] = [];

  for (const block of blocks) {
    for (const f of block.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        result.push(f);
      }
    }
  }

  return result;
}

/**
 * Merge state fields from multiple STATE blocks, deduplicating by the
 * combination of name and access mode.
 */
function mergeStateFields(
  blocks: readonly StateNode[],
): readonly StateFieldNode[] {
  const seen = new Set<string>();
  const result: StateFieldNode[] = [];

  for (const block of blocks) {
    for (const f of block.fields) {
      const key = `${f.access}:${f.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(f);
      }
    }
  }

  return result;
}

/**
 * Merge dependencies from multiple DEPENDS blocks, deduplicating by name
 * and sorting alphabetically for determinism.
 */
function mergeDependencies(
  blocks: readonly DependsNode[],
): readonly DependencyDef[] {
  const seen = new Map<string, DependencyDef>();

  for (const block of blocks) {
    for (const dep of block.dependencies) {
      if (!seen.has(dep.name)) {
        seen.set(dep.name, dep);
      }
    }
  }

  // Sort alphabetically for determinism
  const sortedNames = [...seen.keys()].sort();
  return sortedNames.map((name) => {
    const existing = seen.get(name);
    if (existing) return existing;
    return dependencyDef({ name });
  });
}
