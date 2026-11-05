/**
 * Incremental JSON reader that keeps only the paths you name (WP12 batch 3,
 * review rounds 1 and 2).
 *
 * ## Why it exists
 *
 * An npm packument lists every release of a package: measured 2026-11-05,
 * decompressed, renovate 74.3 MB, vite 39.0 MB, next 31.5 MB, npm 26.1 MB.
 * `JSON.parse` of such a body is a 250-450 MB object graph (V8 spends 2-6x the
 * source bytes) per request. The three npm capabilities use a few fields of
 * it, so this reader scans the bytes as they arrive and materialises only
 * those.
 *
 * ## The memory promise, and what keeps it
 *
 * Resident memory is one network chunk, plus the picked data, plus a stack of
 * at most `MAX_JSON_DEPTH` small frames. Whoever publishes a package controls
 * the bytes of its packument, so each way a document could make a naive
 * reader grow is closed explicitly:
 *
 *   - nesting: every container, picked or not, is a frame, and nesting past
 *     `MAX_JSON_DEPTH` (128; real packuments reach about 8) is refused, so
 *     `[[[[...` costs 128 frames, not one per byte;
 *   - keys: bytes of a key are collected only in a PICKED object, as buffer
 *     slices, and only while the key could still match (a spec without `"*"`
 *     stops collecting past its longest named key; one with `"*"` refuses a
 *     key past `MAX_KEY_BYTES`). Keys of unpicked objects are skipped without
 *     keeping a byte;
 *   - strings and scalars that are not picked are skipped without keeping
 *     anything; a scalar token longer than 64 bytes is refused;
 *   - picked values: one captured value may be at most `MAX_VALUE_BYTES`
 *     (16 MiB) and all picks together `MAX_PICKED_BYTES` (32 MiB). A README
 *     larger than that makes the call refuse rather than materialise;
 *   - a value of the wrong shape for its spec (an array where an object was
 *     named) is replaced by an empty placeholder (`[]`, `""` or `0`) without
 *     being kept, so the caller's own shape check still sees "not an object".
 *
 * ## Validation
 *
 * The scanner enforces the JSON grammar everywhere except inside a captured
 * value (which `JSON.parse` validates): a comma or closer between members and
 * elements, a colon after a key, no trailing comma, valid literals and numbers
 * (no leading zeros), valid string escapes and no raw control characters, and
 * nothing but whitespace after the root. Every violation, and a body that ends
 * early or whose root is not an object, throws `SyntaxError`, as `JSON.parse`
 * would. A UTF-8 byte-order mark is not accepted.
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

/** A document that would make this reader hold more than it promises. */
export class JsonPickLimitError extends Error {
  constructor(
    readonly kind: "depth" | "key" | "value" | "picked",
    message: string,
  ) {
    super(message);
    this.name = "JsonPickLimitError";
  }
}

export const MAX_JSON_DEPTH = 128;
export const MAX_KEY_BYTES = 4096;
export const MAX_VALUE_BYTES = 16 * 1024 * 1024;
export const MAX_PICKED_BYTES = 32 * 1024 * 1024;
const MAX_SCALAR_BYTES = 64;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;

const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;
const isDelim = (b: number) => isSpace(b) || b === COMMA || b === RBRACE || b === RBRACKET;
const isDigit = (b: number) => b >= 0x30 && b <= 0x39;
const isHex = (b: number) => isDigit(b) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
// " \ / b f n r t
const SIMPLE_ESCAPES = new Set([0x22, 0x5c, 0x2f, 0x62, 0x66, 0x6e, 0x72, 0x74]);

const syntax = (what: string) => new SyntaxError(`Invalid JSON: ${what}`);

type St = "keyOrEnd" | "key" | "colon" | "value" | "commaOrEnd" | "valueOrEnd";

interface Frame {
  arr: boolean;
  st: St;
  /** Non-null only for a picked object. */
  spec: Pick | null;
  out: Record<string, unknown> | null;
  key: string;
  keyOverflow: boolean;
  maxKey: number;
  wildcard: boolean;
}

function childSpec(spec: Pick | null, key: string): Pick | null {
  if (spec === null || spec === true || spec === "keys") return null;
  if (Object.hasOwn(spec, key)) return spec[key];
  return Object.hasOwn(spec, "*") ? spec["*"] : null;
}

// Number grammar states.
const enum Num { Sign, Zero, Int, Frac0, Frac, Exp0, ExpSign, Exp }

export class JsonPicker {
  private readonly stack: Frame[] = [];
  private root: Record<string, unknown> | null = null;
  private rootStarted = false;
  private done = false;

  private mode: "idle" | "str" | "scalar" | "capture" = "idle";

  // string state
  private strIsKey = false;
  private strCollect = false;
  private esc = false;
  private hexLeft = 0;
  private keyParts: Buffer[] = [];
  private keyLen = 0;

  // scalar state
  private lit: string | null = null;
  private litPos = 0;
  private num: Num = Num.Sign;
  private scalarLen = 0;

  // capture state
  private capParts: Buffer[] = [];
  private capKind: "container" | "string" | "scalar" = "container";
  private capDepth = 0;
  private capInStr = false;
  private capEsc = false;
  private capBytes = 0;
  private pickedBytes = 0;
  private capAssign: ((v: unknown) => void) | null = null;

  constructor(private readonly spec: Pick) {}

  write(chunk: Uint8Array): void {
    const n = chunk.length;
    let i = 0;
    while (i < n) {
      switch (this.mode) {
        case "capture":
          i = this.scanCapture(chunk, i);
          break;
        case "str":
          i = this.scanString(chunk, i);
          break;
        case "scalar":
          i = this.scanScalar(chunk, i);
          break;
        default:
          i = this.idle(chunk, i);
      }
    }
  }

  /** The picked document. Throws SyntaxError if the body was not a complete object. */
  finish(): Record<string, unknown> {
    if (!this.done || this.mode !== "idle" || !this.root) throw new SyntaxError("Unexpected end of JSON input");
    return this.root;
  }

  // ── structure ───────────────────────────────────────────────────────────

  private idle(chunk: Uint8Array, i: number): number {
    const b = chunk[i];
    if (isSpace(b)) return i + 1;
    const top = this.stack[this.stack.length - 1];

    if (!top) {
      if (this.done) throw syntax("content after the root value");
      if (this.rootStarted || b !== LBRACE) throw syntax("the root is not an object");
      this.rootStarted = true;
      this.root = Object.create(null) as Record<string, unknown>;
      this.pushObject(this.spec, this.root);
      return i + 1;
    }

    if (top.arr) {
      switch (top.st) {
        case "valueOrEnd":
          if (b === RBRACKET) return this.close(i);
          return this.startValue(chunk, i, top);
        case "value":
          return this.startValue(chunk, i, top);
        default: // commaOrEnd
          if (b === COMMA) top.st = "value";
          else if (b === RBRACKET) return this.close(i);
          else throw syntax("expected ',' or ']'");
          return i + 1;
      }
    }

    switch (top.st) {
      case "keyOrEnd":
        if (b === RBRACE) return this.close(i);
      // falls through
      case "key":
        if (b !== QUOTE) throw syntax("expected a string key");
        top.keyOverflow = false;
        this.beginString(true, top.out !== null);
        return i + 1;
      case "colon":
        if (b !== COLON) throw syntax("expected ':' after a key");
        top.st = "value";
        return i + 1;
      case "value":
        return this.startValue(chunk, i, top);
      default: // commaOrEnd
        if (b === COMMA) top.st = "key";
        else if (b === RBRACE) return this.close(i);
        else throw syntax("expected ',' or '}'");
        return i + 1;
    }
  }

  private pushObject(spec: Pick | null, out: Record<string, unknown> | null): void {
    if (this.stack.length >= MAX_JSON_DEPTH) {
      throw new JsonPickLimitError("depth", `nesting deeper than ${MAX_JSON_DEPTH} levels`);
    }
    let maxKey = 0;
    let wildcard = false;
    if (spec !== null && out !== null) {
      if (spec === "keys" || spec === true || Object.hasOwn(spec, "*")) {
        wildcard = true;
        maxKey = MAX_KEY_BYTES;
      } else {
        // A key with escapes can be up to 12 raw bytes per decoded character.
        for (const k of Object.keys(spec)) maxKey = Math.max(maxKey, Buffer.byteLength(k) * 12);
        maxKey = Math.min(maxKey, MAX_KEY_BYTES);
      }
    }
    this.stack.push({ arr: false, st: "keyOrEnd", spec, out, key: "", keyOverflow: false, maxKey, wildcard });
  }

  private pushArray(): void {
    if (this.stack.length >= MAX_JSON_DEPTH) {
      throw new JsonPickLimitError("depth", `nesting deeper than ${MAX_JSON_DEPTH} levels`);
    }
    this.stack.push({ arr: true, st: "valueOrEnd", spec: null, out: null, key: "", keyOverflow: false, maxKey: 0, wildcard: false });
  }

  private close(i: number): number {
    this.stack.pop();
    if (this.stack.length === 0) this.done = true;
    else this.valueDone();
    return i + 1;
  }

  private valueDone(): void {
    const top = this.stack[this.stack.length - 1];
    if (top) top.st = "commaOrEnd";
  }

  private startValue(chunk: Uint8Array, i: number, top: Frame): number {
    const b = chunk[i];
    let spec: Pick | null = null;
    let assign: ((v: unknown) => void) | null = null;
    const out = top.out;
    if (!top.arr && out && !top.keyOverflow) {
      const key = top.key;
      if (top.spec === "keys") {
        out[key] = Object.create(null);
      } else {
        spec = childSpec(top.spec, key);
        if (spec !== null) assign = (v) => { out[key] = v; };
      }
    }

    if (spec === true) {
      this.beginCapture(b, assign!);
      return this.scanCapture(chunk, i);
    }

    if (spec !== null && b === LBRACE) {
      const child = Object.create(null) as Record<string, unknown>;
      assign!(child);
      top.st = "value"; // restored by close()'s valueDone()
      this.pushObject(spec, child);
      return i + 1;
    }

    // Everything below skips the value. A wrong-shaped value for a spec gets
    // a placeholder so the caller can still see it is not the shape it named.
    if (spec !== null) assign!(b === LBRACKET ? [] : b === QUOTE ? "" : 0);

    if (b === LBRACE) {
      this.pushObject(null, null);
      return i + 1;
    }
    if (b === LBRACKET) {
      this.pushArray();
      return i + 1;
    }
    if (b === QUOTE) {
      this.beginString(false, false);
      return i + 1;
    }
    this.beginScalar(b);
    return i + 1;
  }

  // ── strings ─────────────────────────────────────────────────────────────

  private beginString(isKey: boolean, collect: boolean): void {
    this.mode = "str";
    this.strIsKey = isKey;
    this.strCollect = isKey && collect;
    this.esc = false;
    this.hexLeft = 0;
    this.keyParts = [];
    this.keyLen = 0;
  }

  private collectKey(slice: Uint8Array): void {
    const top = this.stack[this.stack.length - 1];
    this.keyLen += slice.length;
    if (this.keyLen > top.maxKey) {
      if (top.wildcard) throw new JsonPickLimitError("key", `a key longer than ${MAX_KEY_BYTES} bytes`);
      // No named key is this long: it cannot match. Stop keeping bytes.
      top.keyOverflow = true;
      this.keyParts = [];
      this.strCollect = false;
      return;
    }
    this.keyParts.push(Buffer.from(slice));
  }

  private scanString(chunk: Uint8Array, from: number): number {
    const n = chunk.length;
    let j = from;
    while (j < n) {
      const b = chunk[j];
      if (this.hexLeft > 0) {
        if (!isHex(b)) throw syntax("bad \\u escape");
        this.hexLeft--;
        j++;
      } else if (this.esc) {
        this.esc = false;
        if (b === 0x75) this.hexLeft = 4;
        else if (!SIMPLE_ESCAPES.has(b)) throw syntax("bad escape");
        j++;
      } else if (b === QUOTE) {
        if (this.strCollect && j > from) this.collectKey(chunk.subarray(from, j));
        this.endString();
        return j + 1;
      } else if (b === BACKSLASH) {
        this.esc = true;
        j++;
      } else if (b < 0x20) {
        throw syntax("control character in a string");
      } else {
        j++;
      }
    }
    if (this.strCollect && n > from) this.collectKey(chunk.subarray(from, n));
    return n;
  }

  private endString(): void {
    this.mode = "idle";
    if (!this.strIsKey) {
      this.valueDone();
      return;
    }
    const top = this.stack[this.stack.length - 1];
    if (top.out !== null && !top.keyOverflow) {
      const raw = Buffer.concat(this.keyParts, this.keyLen);
      top.key = raw.includes(BACKSLASH) ? (JSON.parse(`"${raw.toString("utf8")}"`) as string) : raw.toString("utf8");
    }
    this.keyParts = [];
    top.st = "colon";
  }

  // ── scalars ─────────────────────────────────────────────────────────────

  private beginScalar(b: number): void {
    this.mode = "scalar";
    this.scalarLen = 1;
    this.lit = null;
    if (b === 0x74) { this.lit = "true"; this.litPos = 1; }
    else if (b === 0x66) { this.lit = "false"; this.litPos = 1; }
    else if (b === 0x6e) { this.lit = "null"; this.litPos = 1; }
    else if (b === 0x2d) this.num = Num.Sign;
    else if (b === 0x30) this.num = Num.Zero;
    else if (b >= 0x31 && b <= 0x39) this.num = Num.Int;
    else throw syntax("unexpected character where a value was expected");
  }

  private stepScalar(b: number): void {
    if (this.lit !== null) {
      if (b !== this.lit.charCodeAt(this.litPos)) throw syntax("bad literal");
      this.litPos++;
      return;
    }
    const e = b === 0x65 || b === 0x45;
    switch (this.num) {
      case Num.Sign:
        if (b === 0x30) this.num = Num.Zero;
        else if (b >= 0x31 && b <= 0x39) this.num = Num.Int;
        else throw syntax("bad number");
        return;
      case Num.Zero:
      case Num.Int:
        if (this.num === Num.Int && isDigit(b)) return;
        if (b === 0x2e) this.num = Num.Frac0;
        else if (e) this.num = Num.Exp0;
        else throw syntax("bad number");
        return;
      case Num.Frac0:
        if (!isDigit(b)) throw syntax("bad number");
        this.num = Num.Frac;
        return;
      case Num.Frac:
        if (isDigit(b)) return;
        if (e) this.num = Num.Exp0;
        else throw syntax("bad number");
        return;
      case Num.Exp0:
        if (b === 0x2b || b === 0x2d) this.num = Num.ExpSign;
        else if (isDigit(b)) this.num = Num.Exp;
        else throw syntax("bad number");
        return;
      case Num.ExpSign:
        if (!isDigit(b)) throw syntax("bad number");
        this.num = Num.Exp;
        return;
      default: // Exp
        if (!isDigit(b)) throw syntax("bad number");
    }
  }

  private scalarComplete(): boolean {
    if (this.lit !== null) return this.litPos === this.lit.length;
    return this.num === Num.Zero || this.num === Num.Int || this.num === Num.Frac || this.num === Num.Exp;
  }

  private scanScalar(chunk: Uint8Array, from: number): number {
    const n = chunk.length;
    let j = from;
    while (j < n) {
      const b = chunk[j];
      if (isDelim(b)) {
        if (!this.scalarComplete()) throw syntax("incomplete literal or number");
        this.mode = "idle";
        this.valueDone();
        return j; // the delimiter is processed as structure
      }
      if (++this.scalarLen > MAX_SCALAR_BYTES) throw new JsonPickLimitError("value", "a literal or number longer than 64 bytes");
      this.stepScalar(b);
      j++;
    }
    return n;
  }

  // ── capture ─────────────────────────────────────────────────────────────

  private beginCapture(first: number, assign: (v: unknown) => void): void {
    this.mode = "capture";
    this.capParts = [];
    this.capAssign = assign;
    this.capDepth = 0;
    this.capInStr = false;
    this.capEsc = false;
    this.capBytes = 0;
    this.capKind = first === LBRACE || first === LBRACKET ? "container" : first === QUOTE ? "string" : "scalar";
  }

  private keep(slice: Uint8Array): void {
    this.capBytes += slice.length;
    this.pickedBytes += slice.length;
    if (this.capBytes > MAX_VALUE_BYTES) throw new JsonPickLimitError("value", `a selected value larger than ${MAX_VALUE_BYTES / 1048576} MiB`);
    if (this.pickedBytes > MAX_PICKED_BYTES) throw new JsonPickLimitError("picked", `selected fields totalling more than ${MAX_PICKED_BYTES / 1048576} MiB`);
    this.capParts.push(Buffer.from(slice));
  }

  /** Copy bytes of the captured value; returns the next index to process. */
  private scanCapture(chunk: Uint8Array, from: number): number {
    const n = chunk.length;
    for (let i = from; i < n; i++) {
      const b = chunk[i];
      if (this.capKind === "scalar") {
        if (isDelim(b)) {
          this.keep(chunk.subarray(from, i));
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
            this.keep(chunk.subarray(from, i + 1));
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
        if (b === LBRACE || b === LBRACKET) {
          if (this.stack.length + ++this.capDepth > MAX_JSON_DEPTH) {
            throw new JsonPickLimitError("depth", `nesting deeper than ${MAX_JSON_DEPTH} levels`);
          }
        } else if (b === RBRACE || b === RBRACKET) {
          if (--this.capDepth === 0) {
            this.keep(chunk.subarray(from, i + 1));
            this.completeCapture();
            return i + 1;
          }
        }
      }
    }
    // Chunk ended mid-value: keep what we have and continue next write().
    this.keep(chunk.subarray(from, n));
    return n;
  }

  private completeCapture(): void {
    const text = Buffer.concat(this.capParts, this.capBytes).toString("utf8");
    this.capParts = [];
    const assign = this.capAssign;
    this.capAssign = null;
    this.mode = "idle";
    assign?.(JSON.parse(text));
    this.valueDone();
  }
}
