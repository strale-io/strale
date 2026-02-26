import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("diff-json", async (input: CapabilityInput) => {
  const before = input.before;
  const after = input.after;

  if (before === undefined) throw new Error("'before' is required.");
  if (after === undefined) throw new Error("'after' is required.");

  const beforeObj = typeof before === "string" ? JSON.parse(before) : before;
  const afterObj = typeof after === "string" ? JSON.parse(after) : after;

  const added: Array<{ path: string; value: unknown }> = [];
  const removed: Array<{ path: string; value: unknown }> = [];
  const changed: Array<{ path: string; old_value: unknown; new_value: unknown }> = [];

  diffObjects(beforeObj, afterObj, "", added, removed, changed);

  return {
    output: {
      identical: added.length === 0 && removed.length === 0 && changed.length === 0,
      added_count: added.length,
      removed_count: removed.length,
      changed_count: changed.length,
      added,
      removed,
      changed,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function diffObjects(
  before: unknown,
  after: unknown,
  path: string,
  added: Array<{ path: string; value: unknown }>,
  removed: Array<{ path: string; value: unknown }>,
  changed: Array<{ path: string; old_value: unknown; new_value: unknown }>,
): void {
  // Same value
  if (JSON.stringify(before) === JSON.stringify(after)) return;

  // Different types
  if (typeof before !== typeof after || Array.isArray(before) !== Array.isArray(after)) {
    changed.push({ path: path || "/", old_value: before, new_value: after });
    return;
  }

  // Both arrays
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLen = Math.max(before.length, after.length);
    for (let i = 0; i < maxLen; i++) {
      const itemPath = `${path}/${i}`;
      if (i >= before.length) {
        added.push({ path: itemPath, value: after[i] });
      } else if (i >= after.length) {
        removed.push({ path: itemPath, value: before[i] });
      } else {
        diffObjects(before[i], after[i], itemPath, added, removed, changed);
      }
    }
    return;
  }

  // Both objects
  if (before !== null && after !== null && typeof before === "object" && typeof after === "object") {
    const beforeObj = before as Record<string, unknown>;
    const afterObj = after as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

    for (const key of allKeys) {
      const keyPath = `${path}/${key}`;
      if (!(key in beforeObj)) {
        added.push({ path: keyPath, value: afterObj[key] });
      } else if (!(key in afterObj)) {
        removed.push({ path: keyPath, value: beforeObj[key] });
      } else {
        diffObjects(beforeObj[key], afterObj[key], keyPath, added, removed, changed);
      }
    }
    return;
  }

  // Primitive values differ
  changed.push({ path: path || "/", old_value: before, new_value: after });
}
