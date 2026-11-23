/**
 * Characters PostgreSQL cannot store in jsonb or text: U+0000, and UTF-16
 * surrogates that are not part of a pair (JSON.stringify writes those as
 * `\udXXX`, which jsonb rejects). One of them anywhere in a tool's output
 * makes the write that records a finished call fail, so the call errors
 * after the work is done. Seen on 2026-11-19 with `url-to-text` on PDFs.
 */
const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const HAS_UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export interface StorableResult<T> {
  value: T;
  /** Characters removed, across every string and key. */
  removed: number;
}

/**
 * Return `value` with those characters removed from every string and object
 * key, walking arrays and plain objects only. Anything else (Dates, Buffers,
 * class instances) is passed through untouched. Copy-on-write: when nothing
 * needs removing, the same references come back.
 */
export function toStorableJson<T>(value: T): StorableResult<T> {
  let removed = 0;
  const clean = (text: string): string => {
    if (!HAS_UNSTORABLE.test(text)) return text;
    return text.replace(UNSTORABLE, () => {
      removed++;
      return "";
    });
  };
  const walk = (node: unknown, depth: number): unknown => {
    if (typeof node === "string") return clean(node);
    if (depth > 200 || typeof node !== "object" || node === null) return node;
    if (Array.isArray(node)) {
      let copy: unknown[] | undefined;
      for (let i = 0; i < node.length; i++) {
        const next = walk(node[i], depth + 1);
        if (next !== node[i]) (copy ??= node.slice())[i] = next;
      }
      return copy ?? node;
    }
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) return node;
    const entries = Object.entries(node as Record<string, unknown>);
    let changed = false;
    const cleaned = entries.map(([key, child]) => {
      const nextKey = clean(key);
      const next = walk(child, depth + 1);
      if (nextKey !== key || next !== child) changed = true;
      return [key, nextKey, next] as const;
    });
    if (!changed) return node;
    // defineProperty, so a cleaned key such as "__proto__" stays a key and
    // never sets the copy's prototype. A cleaned key that matches a key the
    // object already has never overwrites it: the dirty one is dropped.
    const copy: Record<string, unknown> = {};
    const original = new Set(entries.map(([key]) => key));
    for (const [key, nextKey, next] of cleaned) {
      if (nextKey !== key && (original.has(nextKey) || Object.prototype.hasOwnProperty.call(copy, nextKey))) continue;
      Object.defineProperty(copy, nextKey, { value: next, enumerable: true, writable: true, configurable: true });
    }
    return copy;
  };
  const result = walk(value, 0) as T;
  return { value: result, removed };
}
