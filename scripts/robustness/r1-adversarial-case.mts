// Robustness R1 (T1) adversarial-input harness, used for the receipts
// archive/receipts/2026-11-11-check-robustness-r1-*.json. Run it through
// r1-adversarial-drive.sh, which runs each case in its own process.
// Usage: npx tsx scripts/robustness/r1-adversarial-case.mts <after|before> <case>
// "before" imports apps/api/src/capabilities/lib/__failbefore-readability.ts,
// which the drive script creates from the commit before #964 and removes again.
import { fileURLToPath } from "node:url";
const WT = fileURLToPath(new URL("../../apps/api/src", import.meta.url));
const KB = 1024, MB = 1024 * 1024;
const fill = (unit: string, bytes: number) => unit.repeat(Math.floor(bytes / unit.length));
const CASES: Record<string, () => string> = {
  "nested-div-16KB": () => fill("<div>", 16 * KB) + "x",
  "nested-div-32KB": () => fill("<div>", 32 * KB) + "x",
  "nested-div-64KB": () => fill("<div>", 64 * KB) + "x",
  "nested-formatting-16KB": () => fill("<b><i><u>", 16 * KB) + "x",
  "nested-formatting-32KB": () => fill("<b><i><u>", 32 * KB) + "x",
  "nested-formatting-a-16KB": () => fill("<b><i><u><a>", 16 * KB) + "x",
  "nested-formatting-a-32KB": () => fill("<b><i><u><a>", 32 * KB) + "x",
  "attribute-flood-1MB": () => {
    let s = "<div"; let i = 0;
    while (s.length < MB) s += ` a${i++}="x"`;
    return s + ">x</div>";
  },
  "flat-tags-16MB": () => fill("<p>x", 16 * MB),
};
const [mode, name] = process.argv.slice(2);
const html = `<html><body>${CASES[name]()}</body></html>`;
let maxGap = 0; let last = Date.now();
const tick = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 10);
const out = (o: object) => { clearInterval(tick); console.log(JSON.stringify({ mode, case: name, input_bytes: html.length, ...o })); };
const t0 = Date.now();
try {
  if (mode === "after") {
    const m = await import(`${WT}/capabilities/lib/readability-convert.ts`);
    const { isCapabilityRefusal } = await import(`${WT}/lib/capability-refusal.ts`);
    await m.htmlToCleanMarkdown("<p>warm up</p>", "https://example.test/"); // start the worker first, as the API does after its first call
    maxGap = 0; last = Date.now(); const t1 = Date.now();
    try {
      const r = await m.htmlToCleanMarkdown(html, "https://example.test/");
      out({ outcome: "converted", ms: Date.now() - t1, max_event_loop_gap_ms: maxGap, markdown_chars: (r.markdown ?? r.content ?? "").length });
    } catch (e: any) {
      out({ outcome: "refused", error: e?.name, unbilled_refusal: isCapabilityRefusal(e), ms: Date.now() - t1, max_event_loop_gap_ms: maxGap });
    }
    await m.stopConversionWorkers();
  } else {
    const m = await import(`${WT}/capabilities/lib/__failbefore-readability.ts`);
    try {
      const r = m.htmlToCleanMarkdown(html, "https://example.test/");
      out({ outcome: "converted", ms: Date.now() - t0, max_event_loop_gap_ms: maxGap });
    } catch (e: any) {
      out({ outcome: "threw", error: e?.name, message: String(e?.message).slice(0, 80), ms: Date.now() - t0, max_event_loop_gap_ms: maxGap });
    }
  }
} catch (e: any) { out({ outcome: "harness_error", error: String(e).slice(0, 200) }); }
process.exit(0);
