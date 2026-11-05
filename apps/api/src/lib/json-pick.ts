/**
 * Incremental JSON reader that keeps only the paths you name (WP12 batch 3
 * review round 1, B1).
 *
 * ## Why it exists
 *
 * An npm packument lists every release of a package: measured 2026-11-05,
 * decompressed, renovate 74.3 MB, vite 39.0 MB, next 31.5 MB, npm 26.1 MB. A
 * byte cap at the size of the largest one is a work bound, but `JSON.parse` of
 * that body is still a 250-450 MB object graph (V8 spends 2-6x the source
 * bytes) per request. The three npm capabilities use a few fields of it
 * (dist-tags, `time`, and a few small per-version fields), so this reader
 * scans the bytes as they arrive and materialises only those. Memory is one
 * network chunk plus what was asked for, independent of the packument's size.
 *
 * The scanner is deliberately not a validating parser: it tracks strings,
 * escapes and nesting just far enough to find the requested subtrees, then
 * hands each captured subtree to `JSON.parse`, which throws the same
 * `SyntaxError` a malformed body always did. A body that ends inside a value,
 * or whose root is not an object, throws `SyntaxError` too.
 *
 * ## Pick spec
 *
 * A pick is `true` (keep the whole value), `"keys"` (keep an object's keys,
 * each mapped to `{}`; the values are skipped) or an object mapping keys to
 * picks, where `"*"` matches every key not named. Anything not named is
 * skipped. Containers are null-prototype objects so a key such as
 * `__proto__` is data, not a prototype write.
 *
 *     { name: true, "dist-tags": true, versions: { "*": { scripts: true } } }
 */

export type Pick = true | "keys" | { [key: string]: Pick };

type Frame =
  | { kind: "obj"; spec: Pick | null; out: Record<string, unknown> | null; key: string; expectKey: boolean }
  | { kind: "arr" };

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;

const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;

function childSpec(spec: Pick | null, key: string): Pick | null {
  if (spec === null || spec === true || spec === "keys") return null;
  if (Object.hasOwn(spec, key)) return spec[key];
  return Object.hasOwn(spec, "*") ? spec["*"] : null;
}

export class JsonPicker {
  private readonly stack: Frame[] = [];
  private root: Record<string, unknown> | null = null;
  private rootSeen = false;
  private done = false;

  // idle: between tokens. skipStr / keyStr: inside a string. scalar: inside
  // a number/true/false/null. capture: copying a subtree to parse later.
  private mode: "idle" | "skipStr" | "keyStr" | "scalar" | "capture" = "idle";
  private esc = false;
  private keyBytes: number[] = [];

  private capParts: Buffer[] = [];
  private capKind: "container" | "string" | "scalar" = "container";
  private capDepth = 0;
  private capInStr = false;
  private capEsc = false;
  private capAssign: ((v: unknown) => void) | null = null;

  constructor(private readonly spec: Pick) {}

  write(chunk: Uint8Array): void {
    const n = chunk.length;
    let i = 0;
    while (i < n) {
      if (this.mode === "capture") {
        i = this.scanCapture(chunk, i);
        continue;
      }
      const b = chunk[i];
      switch (this.mode) {
        case "skipStr":
          if (this.esc) this.esc = false;
          else if (b === BACKSLASH) this.esc = true;
          else if (b === QUOTE) this.mode = "idle";
          i++;
          continue;
        case "keyStr":
          if (this.esc) {
            this.esc = false;
            this.keyBytes.push(b);
          } else if (b === BACKSLASH) {
            this.esc = true;
            this.keyBytes.push(b);
          } else if (b === QUOTE) {
            this.finishKey();
            this.mode = "idle";
          } else this.keyBytes.push(b);
          i++;
          continue;
        case "scalar":
          if (isSpace(b) || b === COMMA || b === RBRACE || b === RBRACKET) this.mode = "idle";
          else i++;
          continue; // a delimiter is reprocessed as idle
        default:
          i = this.idle(chunk, i);
      }
    }
  }

  /** The picked document. Throws SyntaxError if the body was not a complete object. */
  finish(): Record<string, unknown> {
    if (this.mode === "capture" && this.capKind === "scalar") this.completeCapture();
    if (!this.rootSeen || !this.root || this.stack.length > 0 || this.mode === "capture" || this.mode === "skipStr" || this.mode === "keyStr") {
      throw new SyntaxError("Unexpected end of JSON input");
    }
    return this.root;
  }

  // ── idle ───────────────────────────────────────────────────────────────

  private idle(chunk: Uint8Array, i: number): number {
    const b = chunk[i];
    if (isSpace(b) || b === COLON) return i + 1;
    const top = this.stack[this.stack.length - 1];

    if (b === COMMA) {
      if (top?.kind === "obj") top.expectKey = true;
      return i + 1;
    }
    if (b === RBRACE || b === RBRACKET) {
      this.stack.pop();
      return i + 1;
    }
    if (top?.kind === "obj" && top.expectKey) {
      if (b === QUOTE) {
        this.keyBytes = [];
        this.esc = false;
        this.mode = "keyStr";
      }
      return i + 1;
    }
    return this.startValue(chunk, i, top);
  }

  private finishKey(): void {
    const top = this.stack[this.stack.length - 1];
    if (top?.kind !== "obj") return;
    const raw = Buffer.from(this.keyBytes);
    top.key = raw.includes(BACKSLASH)
      ? (JSON.parse(`"${raw.toString("utf8")}"`) as string)
      : raw.toString("utf8");
    top.expectKey = false;
  }

  private startValue(chunk: Uint8Array, i: number, top: Frame | undefined): number {
    const b = chunk[i];
    let spec: Pick | null;
    let assign: ((v: unknown) => void) | null = null;
    if (top === undefined) {
      if (this.rootSeen || b !== LBRACE) {
        if (!this.rootSeen) throw new SyntaxError("JSON root is not an object");
        return i + 1; // trailing bytes after the root
      }
      this.rootSeen = true;
      this.root = Object.create(null) as Record<string, unknown>;
      this.stack.push({ kind: "obj", spec: this.spec, out: this.root, key: "", expectKey: true });
      return i + 1;
    }
    if (top.kind === "arr") spec = null;
    else {
      spec = top.out ? childSpec(top.spec, top.key) : null;
      if (top.out && top.spec === "keys") {
        const out = top.out;
        out[top.key] = Object.create(null);
        spec = null;
      }
      const out = top.out;
      const key = top.key;
      if (out && spec !== null) assign = (v) => { out[key] = v; };
    }

    // A value of the wrong shape for its spec (an array where an object was
    // named) is kept whole, so the caller's own shape checks still see it.
    if (spec !== null && spec !== true && b !== LBRACE && top.kind === "obj" && top.out) {
      const out = top.out;
      const key = top.key;
      assign = (v) => { out[key] = v; };
      spec = true;
    }
    if (spec === true) {
      this.beginCapture(b, assign!);
      return this.scanCapture(chunk, i);
    }
    if (b === LBRACE) {
      if (spec !== null && top.kind === "obj" && top.out) {
        const child = Object.create(null) as Record<string, unknown>;
        top.out[top.key] = child;
        this.stack.push({ kind: "obj", spec, out: child, key: "", expectKey: true });
      } else {
        this.stack.push({ kind: "obj", spec: null, out: null, key: "", expectKey: true });
      }
      return i + 1;
    }
    if (b === LBRACKET) {
      this.stack.push({ kind: "arr" });
      return i + 1;
    }
    if (b === QUOTE) {
      this.esc = false;
      this.mode = "skipStr";
      return i + 1;
    }
    this.mode = "scalar";
    return i + 1;
  }

  // ── capture ────────────────────────────────────────────────────────────

  private beginCapture(first: number, assign: (v: unknown) => void): void {
    this.mode = "capture";
    this.capParts = [];
    this.capAssign = assign;
    this.capDepth = 0;
    this.capInStr = false;
    this.capEsc = false;
    this.capKind = first === LBRACE || first === LBRACKET ? "container" : first === QUOTE ? "string" : "scalar";
  }

  /** Copy bytes of the captured value; returns the next index to process. */
  private scanCapture(chunk: Uint8Array, from: number): number {
    const n = chunk.length;
    let i = from;
    for (; i < n; i++) {
      const b = chunk[i];
      if (this.capKind === "scalar") {
        if (isSpace(b) || b === COMMA || b === RBRACE || b === RBRACKET) {
          this.capParts.push(Buffer.from(chunk.subarray(from, i)));
          this.completeCapture();
          return i; // delimiter reprocessed
        }
        continue;
      }
      if (this.capInStr) {
        if (this.capEsc) this.capEsc = false;
        else if (b === BACKSLASH) this.capEsc = true;
        else if (b === QUOTE) {
          this.capInStr = false;
          if (this.capKind === "string") {
            this.capParts.push(Buffer.from(chunk.subarray(from, i + 1)));
            this.completeCapture();
            return i + 1;
          }
        }
        continue;
      }
      if (b === QUOTE) {
        this.capInStr = true;
        continue;
      }
      if (this.capKind === "container") {
        if (b === LBRACE || b === LBRACKET) this.capDepth++;
        else if (b === RBRACE || b === RBRACKET) {
          this.capDepth--;
          if (this.capDepth === 0) {
            this.capParts.push(Buffer.from(chunk.subarray(from, i + 1)));
            this.completeCapture();
            return i + 1;
          }
        }
      }
    }
    // Chunk ended mid-value: keep what we have and continue next write().
    this.capParts.push(Buffer.from(chunk.subarray(from, n)));
    return n;
  }

  private completeCapture(): void {
    const text = Buffer.concat(this.capParts).toString("utf8");
    this.capParts = [];
    const assign = this.capAssign;
    this.capAssign = null;
    this.mode = "idle";
    assign?.(JSON.parse(text));
  }
}
