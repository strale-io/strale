# KYB Agent — LangChain + StraleToolkit

A Python [LangChain](https://python.langchain.com/) agent that runs a KYB
(know-your-business) check — company registry lookup + PEP screening — using
[`langchain-strale`](https://pypi.org/project/langchain-strale/)'s
`StraleToolkit` to expose Strale's capability catalog as LangChain tools.

## What it does

1. Loads every active Strale capability tagged `company-data` or `compliance`
   as a LangChain tool (~30 tools) via `StraleToolkit(api_key=...).get_tools()`.
2. Hands them to a `claude-sonnet-5` agent (`langchain.agents.create_agent`).
3. Asks it to verify a company: registry status via `swedish-company-data`,
   then a PEP (politically-exposed-person) screen via `pep-check`.
4. Prints the agent's summary.

## Prerequisites

- Python 3.10+
- A Strale API key — sign up at [strale.dev/signup](https://strale.dev/signup)
  for EUR 2.00 free trial credit, no card required
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com/settings/keys)

## Install

```bash
cd examples/kyb-agent-langchain
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# edit .env with your real STRALE_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
python kyb_agent.py
# or with your own target:
python kyb_agent.py 556703-7485 "Spotify AB"
```

The default target (`556703-7485` / Spotify AB) is the `swedish-company-data`
manifest's own known-answer test fixture — a real, stable Swedish
organisation number, not a placeholder. You can pass any other Swedish
`org_number` as the first argument.

## Expected output

```
Loaded 33 Strale tools (company-data + compliance)

=== SUMMARY ===
**KYB Summary — Spotify AB (556703-7485)**

- **Registry status:** Active Aktiebolag, incorporated 2006-05-10, registered
  at Regeringsgatan 19, Stockholm. VAT: SE556703748501. SNI code 60100
  (radio broadcasting/audio distribution). No ongoing insolvency/legal
  procedures.
- **PEP screening:** No matches found across 230+ PEP lists (EU, Nordic, and
  global sources) for "Spotify AB."
- **UBO data:** Not available via Bolagsverket's public API at this time.

**Assessment:** No adverse registry or PEP signals identified. Company
appears in good standing. Recommend supplementing with sanctions and
adverse-media checks, plus manual UBO verification, for a complete
due-diligence file.
```

Exact wording varies run to run (it's an LLM). Cost: ~10 cents of Strale
wallet balance (5c `swedish-company-data` + 5c `pep-check`) plus a small
Anthropic API charge for the agent loop (a few cents).

## Known constraint (by design, not a bug)

`swedish-company-data` requires an **organisation number**, not a free-text
company name — Bolagsverket's underlying HVD API has no name search, and an
earlier LLM-based name resolver was removed because it depended on scraping
a site that's since off-limits. If you ask the agent to verify a company by
name only, it will tell you it needs the org number rather than guessing one.

## Verified

Ran end-to-end on 2026-08-13 against production `https://api.strale.io` with
a real (test) Strale API key and a real Claude Sonnet 5 call. Package
versions in `requirements.txt` are the exact versions that were installed
and exercised, not aspirational ranges.

## Other capabilities to try

Swap the `categories` filter in `kyb_agent.py` or drop it entirely to get
the full catalog (250+ tools) — see `strale_search` (built into every
toolkit) for keyword-based discovery, e.g. `vat-validate`,
`adverse-media-check`, `annual-report-extract`.
