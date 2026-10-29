// Run INSIDE the production image via docker exec (image-boot-smoke).
// document-ocr shells out to tesseract, pdfinfo, pdftoppm and pdfunite, and
// reads the language packs the Dockerfile installs; none of that is visible
// to a unit test on the CI runner. This runs the compiled engine on a real
// scanned page pair (Riksdagen motion 1975:36, two 200 dpi pages) and fails
// if any binary, language pack or the searchable-PDF font is missing, or if
// the children would run as root.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = await import("/app/apps/api/dist/capabilities/lib/ocr/engine.js");
const installed = await engine.installedLanguages();
for (const lang of engine.SUPPORTED_LANGUAGES) assert.ok(installed.includes(lang), `language pack '${lang}' is missing from the image`);
const identity = engine.childIdentity();
assert.ok(identity && identity.uid > 0, `OCR children must run as '${engine.CHILD_USER}', not root`);

const started = Date.now();
const data = readFileSync("/app/apps/api/src/capabilities/lib/ocr/fixtures/riksdagen-mot-1975-36.pdf");
const result = await engine.ocrDocument({ kind: "pdf", data }, {
  languages: ["swe", "eng"], first_page: 1, max_pages: 50, deadline: Date.now() + 120_000,
  searchable_pdf: { max_file_bytes: 10 * 1024 * 1024, max_total_bytes: 25 * 1024 * 1024, max_parts: 9 },
});
assert.equal(result.total_pages, 2);
assert.deepEqual(result.pages.map((p) => p.status), ["ok", "ok"], JSON.stringify(result.pages.map((p) => p.error)));
const text = result.pages.map((p) => p.text).join("\n");
for (const word of ["arbetarskyddslagen", "underjordsarbete", "jämställdhet"]) assert.ok(text.includes(word), `OCR text lacks '${word}'`);
assert.ok(result.pages[0].mean_confidence >= 80, `page 1 confidence ${result.pages[0].mean_confidence}`);
assert.equal(result.pdf_parts.length, 1, "expected one searchable PDF part");
assert.equal(result.pdf_parts[0].data.subarray(0, 5).toString(), "%PDF-", "no searchable PDF");

console.log(JSON.stringify({
  engine: await engine.tesseractVersion(),
  languages: installed,
  child_uid: identity.uid,
  ms: Date.now() - started,
  confidence: result.pages.map((p) => p.mean_confidence),
  words: result.pages.map((p) => p.word_count),
  searchable_pdf_bytes: result.pdf_parts[0].data.length,
}));
