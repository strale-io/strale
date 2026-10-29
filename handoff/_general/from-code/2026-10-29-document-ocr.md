Intent: portfolio plan item 2.4. Add bulk OCR for many-page scanned documents on the self-hosted route the research chose, on the async-jobs-with-file-output path.

## Outcome

- **New capability `document-ocr`, €0.10 a call for up to 50 pages.**
  - That is €0.002 a page on a full window. A 500-page document is ten calls, €1.00.
  - A one-page call still costs €0.10. The limitation says so and points single images to `image-to-text` (€0.05).
  - Compute measured at about €0.025 per 1,000 pages (research file below).
- **Engine:** Tesseract 5 with poppler, run as child processes in the API container. There is no vendor and no account, and nothing leaves Strale. The route comes from `docs/research/2026-10-29-transcription-and-bulk-ocr-vendors.md` (#842).
- **Input:** one of
  - `url`: a PDF or image, up to 8 MB;
  - `base64`: bounded by the 1 MB `/v1` body;
  - `image_urls`: one image per page, each up to 4 MB, 8 MB in total per call.

  Optional: `languages` (up to 3 of eng, swe, dan, nor, fin, deu, fra, spa, ita, nld), `first_page`, `max_pages` (up to 50), and `output_file` (text, pdf, both or none).
- **Output:**
  - Text per page, with mean confidence, word count and status.
  - `next_first_page` and `complete`, so a long document is read window by window.
  - `low_confidence_pages`.
  - A `.txt` and/or a searchable PDF as job files. The PDF is omitted, with a reason, when it would exceed the 10 MB file cap.
- **Async path:** `avg_latency_ms: 30000`, which is over the 10 s threshold. The call reserves, and capture happens only on success. A job where no page could be read fails and is not charged.
- **Independent review** (a separate read-only agent) found two blocking issues and four should-fix issues. All six are fixed in the second commit:
  - **x402.** Promotion no longer opens x402 for a capability on the async path (`runsAsync` in `capability-promotion`). The synchronous x402 rails cannot deliver job files, so such a call would do all its work and then fail unpaid.
  - **Time budget.** One 240 s deadline per call, kept across the platform's transient retry, now bounds:
    - the fetches;
    - the queue wait;
    - every child process's kill time;
    - the PDF merge.

    Before this, a page started near the old 180 s budget could run past the 300 s hard timeout, and every page already read was lost.
  - **Searchable PDF.** Each page embeds whichever is smaller, PNG or JPEG: a noisy scan measured about 336 KB a page. The PDF is split into parts within the file caps. A call that asks only for a PDF and gets none fails uncharged.
  - **Unprivileged children.** poppler and tesseract run as the user `strale-ocr`, created in the Dockerfile. The probe asserts this; measured uid 999 in the bookworm layer.
  - **Owner-password PDFs** are accepted. Only a PDF that will not open is refused.
  - **Decoding.** Image decoding moved inside the queue, and the queue now holds one waiting document.
- **Bounds** (`apps/api/src/capabilities/lib/ocr/engine.ts`, after the review):
  - One document at a time per process and one waiting. A call is refused, uncharged, when the queue is full or the document reaches the front with less than 25 s of its deadline left.
  - 2 pages in flight. Each child is single-threaded, runs at nice 10 under `prlimit` (1.5 GB address space, 90 s CPU) and is killed after its wall-clock limit.
  - Pages render at most 3508 px on the long side. Caller images are decoded by sharp under a 60 MP cap.
  - No new page starts with less than 25 s of the 240 s deadline left (the async hard timeout is 300 s). The pages already read are returned, with `stopped_early_reason: time_budget`.
  - Children get a fixed minimal environment, without the API's secrets.
- **Docker image:** installs `poppler-utils`, `tesseract-ocr` and ten language packs, and checks them at build time (`tesseract --list-langs`, `pdftoppm -v`).
  - `image-boot-smoke` gained the step "OCR engine runs in the image". It runs `scripts/ci/ocr-probe.mjs` inside the built image. The probe runs the compiled engine on a real scan and fails if a binary or pack is missing.
- **Known-answer fixture:** a real 200 dpi scan, Riksdagen motion 1975:36 (2 pages, Swedish), fetched from `data.riksdagen.se` (robots.txt 404, so allowed). The same file is committed at `apps/api/src/capabilities/lib/ocr/fixtures/` for the image probe and the tests.
- **Measured locally** (4 vCPU, Tesseract 5.3.4):
  - 2-page scan: 6 s, mean confidence 92.7.
  - 50 pages: 86 s, with children peaking at about 340 MB in total and a 7.1 MB searchable PDF.
  - The probe also passed in a Debian bookworm layer built from this Dockerfile's apt line (Tesseract 5.3.0, all 11 packs). It failed, as it should, on plain `node:20-slim`.
  - Receipts: `archive/receipts/2026-10-29-test-run-document-ocr-local-tesseract.json` (first build) and `archive/receipts/2026-10-29-test-run-document-ocr-review-fixes.json` (after the review).

## Next

- **After deploy:**
  1. Run the **Onboard capability** workflow (slug `document-ocr`, mode onboard, discover on). This session holds no production write credential, so the pipeline's DB write happens there.
  2. Check readiness at `/v1/internal/onboarding/readiness?slug=document-ocr`.
- **Dark launch:** onboarding creates the capability `visible=false` and off x402 (DEC-20260812-A). Leave it there until its first green week.
- **Measure on Railway:** a 50-page job's wall time and API latency while it runs. If CPU contention shows, move the engine to its own Railway service. The research recommends that worker; creating the service is an infrastructure step.
- `image-to-text` as the escalation for `low_confidence_pages` stays manual for now.
