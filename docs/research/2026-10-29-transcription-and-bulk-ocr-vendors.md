---
doc_type: research
type: vendor
topic: transcription-and-bulk-ocr-vendors
question: Which speech-to-text and bulk-OCR source should serve portfolio items 2.3 and 2.4, judged first on whether its terms permit use inside Strale's paid API, then on EU processing, retention, price per minute or page, free tier and sign-up, and does a self-hosted option on Railway avoid a vendor account altogether?
date: "2026-10-29"
status: current
sources:
  - docs/strategy/2026-10-23-portfolio-plan.md
  - https://www.speechmatics.com/legal/terms-of-service
  - https://www.speechmatics.com/pricing
  - https://docs.speechmatics.com/get-started/authentication
  - https://deepgram.com/terms
  - https://deepgram.com/pricing
  - https://www.assemblyai.com/legal/terms-of-service
  - https://www.gladia.io/general-terms-of-use-gladia-sas
  - https://www.gladia.io/pricing
  - https://cdn.openai.com/osa/openai-services-agreement.pdf
  - https://developers.openai.com/api/docs/guides/your-data
  - https://platform.openai.com/docs/pricing
  - https://console.groq.com/docs/legal/services-agreement
  - https://elevenlabs.io/oem-terms
  - https://legal.mistral.ai/terms/commercial-terms-of-service
  - https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data
  - https://docs.mistral.ai/inference/pricing
  - https://docs.mistral.ai/admin/monitor-comply/zero-data-retention
  - https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA
  - https://www.microsoft.com/licensing/terms/product/Glossary/all
  - https://prices.azure.com/api/retail/prices
  - https://learn.microsoft.com/en-us/legal/cognitive-services/document-intelligence/data-privacy-security
  - https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr
  - https://cloud.google.com/terms
  - https://cloud.google.com/document-ai/pricing
  - https://cloud.google.com/document-ai/docs/languages
  - https://cloud.google.com/document-ai/docs/security
  - https://aws.amazon.com/agreement/
  - https://aws.amazon.com/service-terms/
  - https://docs.aws.amazon.com/textract/latest/dg/limits-document.html
  - https://www.anthropic.com/legal/commercial-terms
  - https://platform.claude.com/docs/en/about-claude/pricing
  - https://docs.railway.com/reference/pricing/plans
  - https://huggingface.co/datasets/google/fleurs
  - https://huggingface.co/datasets/hf-internal-testing/librispeech_asr_dummy
decisions:
  - DEC-20261023-A
  - DEC-20261024-B
  - DEC-20261027-C
---

# Speech-to-text and bulk OCR: vendors against a self-hosted build

Portfolio plan items 2.3 (audio transcription) and 2.4 (bulk OCR of
many-page scanned documents), approved under DEC-20261024-B, were both
marked "needs Petter: vendor account". Async jobs with file output now exist
(PR #833), so both can run as long jobs. This file compares the vendors on
the gate that DEC-20261023-A sets (vendor data only where the terms permit
resale), then on EU processing, retention, price and sign-up, and measures
the self-hosted option on CPU. All pages were read on 29 October 2026, from
public sources only: no sign-up and no keyed API call. This is evidence,
not a decision.

**Result in one line.** Both items can ship **without any vendor account**:
self-hosted Whisper (large-v3-turbo) for speech and Tesseract 5 for OCR both
run on Railway CPU at a small fraction of vendor prices, at quality measured
below. A vendor is a fallback, not a prerequisite. If Petter wants one ready,
Speechmatics (speech) and Mistral OCR (documents) have the strongest overall position (Speechmatics still needs a written confirmation on §4.3/§4.4).

Confidence: **high** = quoted from the vendor's own page, read today;
**moderate** = vendor page, summarised or indirect; **low** = secondary
source or not verified. EUR uses 1 USD = 0.92 EUR.

## The gate: may Strale put the service inside its own paid API?

No vendor permits plain resale of raw access. The question is whether a
Strale capability, which adds async jobs, file output, provenance, payment
per call and an audit trail, counts as the customer's own product.

### Speech-to-text

| Vendor | Gate | Clause (verbatim) | Confidence |
|---|---|---|---|
| Speechmatics | **Conditional**: integration expressly permitted; same competing-product risk as Deepgram | §3.1.1: "Integration of the Software with other software and services in order to produce Integrated Products". §4.4: "You shall not … use, license or sell the Software as standalone products outside of the Integrated Products." §4.3: no use "to create, train, or improve … a similar or competing product". §4.3 is the same class of clause as Deepgram §2.4(9) and Groq §6.3(e), so a written confirmation is needed before use. | high |
| OpenAI (gpt-4o-mini-transcribe, gpt-transcribe) | **Permitted** | Services Agreement §2.2: "the right to use OpenAI's API to integrate the Services into Customer Applications and to make Customer Applications available to End Users." §3.1: "Customer may not resell or lease access to its Account or any End User Account." | high |
| Mistral (Voxtral) | **Permitted** | Commercial Terms §2.1: licence "non-sublicensable (except to its End Users)"; §1.4: "'Customer Offering' means Customer's own products and services that it makes available to third parties which involve use of the Mistral AI Products." | high |
| Deepgram | **Conditional** | §2.4(4): may not "Resell, redistribute, or make available any portion of our Services on a stand-alone basis. For clarity, you may integrate our Services into your own platform … provided that your Application contributes material independent functionality beyond our Services". §2.4(9): no use for "developing competing models, products or services". A transcription endpoint is close to a competing service. | high |
| Groq (Whisper) | **Conditional** | §3.1 allows Customer Applications for End Users; §6.3(c): no "sell, resell, sublicense … except as expressly approved by Groq"; §6.3(e): no use to develop products "that are similar or compete with the Cloud Services". | high |
| Gladia | **Unclear, treat as no** | §4.1: may not "transfert the API free of charge or for valuable consideration" or "grant any sublicense"; §11.1: licence "non-public". | high (quote), low (reading) |
| AssemblyAI | **Not permitted** on self-serve terms | §2.1: licence "for the internal business purposes of Customer"; §2.4: shall not "(d) use the Services for the benefit of a third party or make the Services available to any third party". | high |
| ElevenLabs Scribe | **Only on a paid OEM plan** | OEM Terms §2.B(f): Free, Starter, Creator and Pro plans are "expressly prohibited from Making Available"; eligibility needs a Scale plan or higher (a spend decision). | high |

### OCR

| Vendor | Gate | Clause (verbatim) | Confidence |
|---|---|---|---|
| Mistral OCR | **Permitted** | Same Commercial Terms as above: sublicensable to End Users of a Customer Offering. | high |
| Anthropic (Claude, PDF input) | **Permitted**, existing account | Commercial Terms A.1: "Anthropic gives Customer permission to use the Services, including to power products and services Customer makes available to its own customers and end users." D.4 bars resale "except as expressly approved by Anthropic". | high |
| Azure Document Intelligence (Read) | **Conditional** | Product Terms: "Customer may permit third parties to access and use the Microsoft Azure Services solely in connection with the use of that Customer Solution"; Glossary: the application must add "primary and significant functionality and is not primarily a substitute"; "billing, license management, and/or infrastructure services" do not count. Foundry Tools also bars building "a similar or competing product or service". A per-page OCR endpoint sits close to "substitute". | high |
| Google Document AI (Enterprise OCR) | **Conditional** | Cloud Terms §1.1: integrate into "any Customer Application that has material value independent of the Services"; §3.3(c): will not "sell, resell, sublicense, transfer, or distribute any or all of the Services". | high |
| AWS Textract | **Conditional, and fails on language** | Customer Agreement §6.4(c): will not "resell the Services". Service Terms §50.3: AWS "may use and store AI Content … to develop and improve" Textract by default, possibly outside the region. Swedish is not supported (below). | high |

## EU processing, retention and training

| Vendor | EU processing | Retention and training | Confidence |
|---|---|---|---|
| Speechmatics | `eu1.asr.api.speechmatics.com`, "(all customers)", no surcharge | No training "unless You opt in" (§10.4); job data kept about 7 days | high; retention moderate |
| OpenAI | `eu.api.openai.com` needs sales approval plus zero retention; +10% | No training by default; logs up to 30 days | high |
| Mistral | "By default, your data is hosted in the European Union" | Zero retention on paid plans on request, `/v1/ocr` listed; no training except opt-in products | high |
| Deepgram | `api.eu.deepgram.com` | Trains by default (Model Improvement Program); per-request `mip_opt_out=true` | high |
| AssemblyAI | `api.eu.assemblyai.com`, same price | Audio deleted in 24–48 h, transcripts from 30 days | high |
| Gladia | Not stated for batch | Trains by default; opt-out button | moderate |
| Azure Read | Region of the resource (Sweden Central, West Europe), same price | Input and results deleted 24 h after processing | high |
| Google Document AI | `eu` multi-region | Batch deleted after one day; no training without permission | high |
| AWS Textract | Frankfurt, Ireland, London, Paris, Zurich, Spain; no Stockholm | Used to improve the service by default; opt-out through an Organizations policy | high |
| Anthropic | No EU option on the first-party API (global or US) | No training on customer content | high |
| **Self-hosted** | Wherever the Railway service runs; Strale's API runs in US East | Nothing leaves Strale; existing 90-day redaction applies | n/a |

Transcripts are personal data under Strale's 90-day persistence, and the
plan marks the PII classification `approval_required`. A self-hosted worker
sends audio to no third party at all, which is the simplest position for
that approval. If EU processing is wanted, the worker can be deployed as its
own Railway service in an EU region (low: not verified from a Railway page in this research; check the regions
list before the build).

## Price per unit, and margin at a band-compliant price

### Speech-to-text, per audio minute

| Source | Cost per minute | Free credit | No commitment | Swedish |
|---|---|---|---|---|
| **Self-hosted Whisper large-v3-turbo** (measured below) | **≈ €0.0011** | n/a | n/a | yes, measured |
| OpenAI gpt-4o-mini-transcribe | $0.003 → €0.0028 | not checked | yes | likely, not confirmed |
| Mistral Voxtral Mini Transcribe 2 | $0.003 → €0.0028 | none listed | yes | **not listed** among its 13 languages |
| Speechmatics, cheapest batch | $0.24/h → €0.0037 | $100, no card | "No commitment and no minimum spend" | yes |
| Deepgram Nova-3 | $0.0043 → €0.0040 | $200, no card | "No minimums" | yes |
| Speechmatics Standard / Enhanced | $0.45/h / $0.75/h → €0.0069 / €0.0115 | | | yes |

**Proposed price: €0.01 per audio minute, minimum €0.02, at most 100 minutes
per call** (€1.00, the top of the band). Longer files need a price outside
the band, which is Petter's call; v1 refuses them. Margin at €0.01/min:
self-hosted ≈ 89%, Speechmatics cheapest tier ≈ 63%, Deepgram ≈ 60%.

### OCR, per page

| Source | Per 1,000 pages | Free tier | Swedish (å ä ö) | Handwriting |
|---|---|---|---|---|
| **Self-hosted Tesseract 5** (measured below) | **≈ €0.025** | n/a | yes, measured | no |
| Anthropic Claude Haiku 5.5 | ≈ €0.5 (estimate: ~2,000 input tokens at $0.10/MTok plus ~700 output at $0.50/MTok per page) | existing account | general model | general model |
| Azure Read | $1.50 → €1.38; $0.60 → €0.55 above 1M | 500 pages/month (2 pages per request) | printed yes | not Nordic |
| Google Document AI | $1.50 → €1.38; $0.60 above 5M | first 1,000 pages | yes | **Swedish handwriting supported** |
| AWS Textract | $1.50 → €1.38 | 1,000 pages/month for 3 months | **not supported**; character list lacks å | English only |
| Mistral OCR | $2 → €1.84 (OCR 3); $4 for OCR 4.1 | none stated | not confirmed | not confirmed |

**Proposed price: €0.002 per page, minimum €0.02, at most 500 pages per
call** (€1.00). Margin at €0.002/page: self-hosted ≈ 98%, Azure or Google
≈ 31%, Mistral ≈ 8%. On any vendor the per-page price would have to rise to
about €0.003, and the page cap fall to 333, to keep a normal margin.

## What was measured (self-hosted)

Machine: this cloud container, 4 vCPU (Intel Xeon 2.1 GHz), CPU only;
Railway's CPU model is not published, so production speed may differ. Railway prices: "$20 / vCPU / month ($0.000463 /
vCPU / minute)" and "$10 / GB / month ($0.000231 / GB / minute)" (Hobby and
Pro alike). Scripts are not committed; method below.

### Speech: faster-whisper 1.2.1, int8, 4 threads, greedy decoding

Corpus: 20 English clips from LibriSpeech (`hf-internal-testing/librispeech_asr_dummy`,
188 s) and 25 Swedish clips from the FLEURS `sv_se` test split (267 s), with
their reference transcripts. Text lower-cased and punctuation removed before
scoring word error rate (jiwer).

| Model | Language | Word error rate | Real-time factor |
|---|---|---|---|
| small | English | 8.0% | 0.20 |
| small | Swedish | **25.9%** (not usable) | 0.18 |
| large-v3-turbo | English | **4.9%** | 0.49 |
| large-v3-turbo | Swedish | **9.8%** | 0.43 |

large-v3-turbo peaks at 2.1 GB resident memory. At a real-time factor of
0.49 on 4 vCPU, one audio minute costs 1.96 vCPU-minutes plus 2.1 GB for
0.49 minutes: about $0.00114, **≈ €0.0011 per audio minute**. An hour of
audio takes about 29 minutes, acceptable on the async path. Loading the
model per job (seconds) avoids paying about €19 a month to keep 2.1 GB
resident when idle.

Licences: the Whisper weights and code are MIT; faster-whisper and
CTranslate2 are MIT. No account, no terms beyond the licence.

**Limits of this measurement.** FLEURS and LibriSpeech are read speech in
quiet rooms. Phone calls, meetings and noisy audio will score worse, and
Whisper is known to invent text on long silences, so voice-activity
filtering must be on. There is no speaker diarization (pyannote would add
it, under its own licence and model gating, not evaluated). Vendors'
conversational accuracy is likely better; this was not measured because it
needs keys.

### OCR: Tesseract 5.3.4, `swe+eng`, one thread per page

Corpus: synthetic A4 pages at 200 dpi, each with an invoice-style header
line and real Swedish sentences (FLEURS text) mixed with English, so å, ä
and ö are exercised. Ten pages per condition; character and word error rate
(jiwer) on the body text.

| Condition | Character error | Word error | Seconds per page (1 thread) |
|---|---|---|---|
| Clean render | 0.04% | 0.3% | 2.85 |
| Scan-like: ±1.5° skew, blur, noise, JPEG q55 | 0.07% | 0.5% | 3.42 |
| Poor scan: stronger blur and noise, JPEG q35, downscaled to 150 dpi | 0.49% | 2.7% | 3.20 |

Tesseract peaks at 67 MB. At 3.4 vCPU-seconds a page: **≈ €0.025 per 1,000
pages** in compute. A 500-page document takes about 7 minutes on 4 threads.
Licence: Apache-2.0.

**Limits of this measurement.** Synthetic pages in one clean serif font are
an upper bound. Real scans with tables, stamps, columns, faded print or
handwriting will do worse, and Tesseract does not read handwriting at all.
Before launch, run one real scanned sample (for example a public-domain
scanned annual report) through it and set the known-answer test on that.
docTR and PaddleOCR were not measured.

## Recommendation

**2.3 Audio transcription: self-hosted faster-whisper large-v3-turbo on its
own Railway worker. No vendor account.** Swedish word error rate 9.8% and
English 4.9% on read speech; ≈ €0.0011 per minute against a €0.01 price.
The vendor to keep in reserve is **Speechmatics**: an express integration
clause (conditional on a written confirmation, like Deepgram's), a self-serve EU endpoint, no training by default, Swedish, free
diarization, $100 credit with no card. Sign up only if real-audio quality
fails or diarization becomes a requirement.

**2.4 Bulk OCR: self-hosted Tesseract 5 (`swe+eng`) on the same worker. No
vendor account.** ≈ 0.07% character error on scan-like pages and 0.49% on poor scans;
≈ €0.025 per 1,000 pages against €2 per 1,000 charged. Claude (existing account, terms
permit) is the escalation path for pages Tesseract reads badly, at about
€0.5 per 1,000 pages (only if pages are sent in chunks under 100,000 tokens;
above that Haiku 5.5 costs 5×), at the cost of possible invented text and US or
global processing. The vendor to keep in reserve is **Mistral OCR**: the
only OCR vendor whose terms name third-party customer offerings outright,
and EU hosting by default; its price leaves a thin margin at €0.002/page. If
Swedish handwriting becomes a requirement, Google Document AI is the only
one that documents it.

**The strongest case against self-hosting:** Strale takes on running a
CPU-heavy worker, and real-world audio and scans are harder than the test
sets. Both are bounded: the worker is separate from the API, the async path
already exists, and a vendor can be added behind the same capability later
without changing its contract.

## Sign-up sheets, prepared but not recommended now

Neither is needed for launch. They are here so that, if the real-sample
check fails, the decision is one click. Earlier contact checked:
`docs/company/OUTBOX.yaml`, `config/env-manifest.yaml` and
`config/vendors.yaml` show no Speechmatics or Mistral account, key or
email.

**Speechmatics** (if needed)
- URL: https://portal.speechmatics.com/ (sign-up from the portal).
- Form: email `petter@strale.io`; name Petter's own; company `Moonlighter AB`;
  country Sweden; use case "Batch transcription inside Strale's tool API
  (strale.dev), async jobs, EU endpoint". No card is needed for the $100
  free credit. The exact form fields were not seen.
- Test key in Bitwarden project `strale`: `STRALE_SPEECHMATICS_API_KEY`,
  tier test; note: account email, sign-up date, purpose "2.3 transcription
  fallback evaluation", expiry none.
- Production key, later: Railway `SPEECHMATICS_API_KEY`, registered in
  `config/env-manifest.yaml` with the executor that reads it.
- One email to send first (inbox routine): confirm that a per-call
  transcription capability inside Strale's catalogue is an "Integrated
  Product" under §3.1.1 and not a standalone product under §4.4.

**Mistral** (if needed, covers OCR; Voxtral lacks Swedish)
- URL: https://console.mistral.ai/ (sign-up, then a billing workspace).
- Form: email `petter@strale.io`; workspace name `Strale (Moonlighter AB)`;
  country Sweden. Paid usage needs card details, which is Petter's step.
  The exact form fields were not seen.
- Test key in Bitwarden: `STRALE_MISTRAL_API_KEY`, tier test.
- Production key, later: Railway `MISTRAL_API_KEY`. Ask for zero data
  retention on `/v1/ocr`, which is available on paid plans on request.

## Open items

- Real-sample quality check for both (a noisy conversational recording with
  a reference transcript; a real scanned multi-page PDF), before either
  capability leaves dark launch.
- Petter's approval of the transcription PII classification
  (`approval_required`, portfolio plan); unchanged by this file.
- Where the worker runs (US East beside the API, or an EU region) is a
  technical choice for the build; EU is preferred for audio.
