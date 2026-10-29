Intent: portfolio items 2.3 (audio transcription) and 2.4 (bulk OCR), DEC-20261024-B: make the vendor-account decision trivial.

## What landed (branch research/asr-ocr-vendors)

- `docs/research/2026-10-29-transcription-and-bulk-ocr-vendors.md`: 8 speech-to-text and
  5 OCR vendors compared on the resale gate (verbatim clauses, URLs), EU processing,
  retention, price per minute/page, free tier, sign-up; plus a CPU measurement of the
  self-hosted options.
- `config/vendors.yaml`: 11 new vendors. evaluating: speechmatics, deepgram, openai-api,
  groq, mistral, azure-document-intelligence, google-document-ai. rejected:
  assemblyai, gladia, elevenlabs, aws-textract. View regenerated.

## Result

- Both items can ship with no vendor account. Measured on 4 vCPU:
  - faster-whisper large-v3-turbo int8: WER 9.8% Swedish (FLEURS, 25 clips) and 4.9%
    English (LibriSpeech, 20 clips), real-time factor 0.43–0.49, 2.1 GB peak.
    About €0.0011 per audio minute on Railway prices.
  - Tesseract 5.3.4 `swe+eng`: CER 0.07% on scan-like synthetic pages and 0.49% on poor
    ones, 3.2–3.4 s per page per thread, 67 MB. About €0.03 per 1,000 pages.
- Proposed prices: €0.01/min (100 min cap) and €0.002/page (500-page cap).
- Reserve vendors, with sign-up sheets prepared and not recommended now: Speechmatics
  (speech) and Mistral OCR.

## Next

- Build: one worker service (separate from the API) on the async path from PR #833.
  It needs a real-sample check before the dark launch ends: noisy conversational audio
  with a reference, and a real scanned PDF.
- Still Petter's: the transcription PII classification (`approval_required`).

Benchmark scripts were not committed (scratch). The method is in the research file.
