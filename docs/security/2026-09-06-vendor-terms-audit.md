# Vendor terms audit — the eight capabilities of 2026-09-06

**Prompted by** a request to have another agent perform three vendor signups.
Before writing that, the obvious question got asked for the first time: *do
these vendors' free tiers permit what Strale actually does with them?* Strale
resells every lookup as a paid per-call capability. Two of the three said no —
and the same question, turned on the eight capabilities already shipped that
morning, found one live violation.

The audit should have run before the executors were written. It did not,
because "free and keyless" was treated as equivalent to "usable", and those are
different properties.

## The three vendors that were about to be signed up

All three prohibit exactly what Strale would have done. **No signup should
happen.** The blocker is not who performs it.

| Vendor | Free-tier terms |
|---|---|
| VirusTotal | Public API "must not be used in commercial products or services". Breach is punished by "immediate permanent ban of the infractor individual or organization" |
| AbuseIPDB | "You may not use Free plans for commercial purposes"; separately, "not to reproduce, duplicate, copy, sell, resell or exploit any portion ... including the API and associated data" |
| urlscan.io | Site "may not be used in connection with any commercial endeavors except those specifically endorsed"; users are "prohibited from using the Site or content ... to create a revenue-generating endeavor" |

`url-threat-scan` therefore cannot be built on free tiers at all. It needs paid
commercial plans from at least one of them — a spend and vendor decision — or a
different vendor whose terms grant redistribution rights, which is the Tier-2
test DEC-20260428-A already sets out.

## Turning the same question on what already shipped

| Capability | Source | Verdict |
|---|---|---|
| `host-exposure-lookup` | Shodan InternetDB | **VIOLATION — deactivated** |
| `breach-exposure-check` | Have I Been Pwned | Permitted, attribution was missing — fixed |
| `cert-transparency-search` | Cert Spotter, crt.sh fallback | OK; free quota (100 hostname queries/day) already declared in the manifest |
| `clinical-trials-search` | ClinicalTrials.gov | OK — US government, public domain |
| `fda-safety-search` | openFDA | OK — US government, public domain |
| `company-fundamentals` | SEC XBRL | OK — US government, public domain |
| `doi-resolve` | Crossref, DataCite | OK — open scholarly metadata |
| `citation-graph` | OpenAlex | OK — CC0 |

### host-exposure-lookup

Shodan's InternetDB is free and needs no key, which is what made it attractive.
It is also licensed for **non-commercial use only**: *"you can't use it to
build commercial products that you charge money for."* This shipped as a paid
EUR 0.05 capability.

Contained without customer impact. It was still dark from the dark-launch path
(`visible = false`, `lifecycle_state = 'validating'`), and production confirms
**zero paying calls ever served**. It is now `is_active = false`, `visible =
false`, `x402_enabled = false`, its five test suites descheduled, and it is in
the `DEACTIVATED` map so a future boot cannot register it.

Had the vendor question waited another ten days, the green week would have
promoted it into paid traffic on the x402 rail.

Reactivating requires a Shodan enterprise licence, or a rebuild on a source
whose terms permit resale.

### breach-exposure-check

Permitted, and this one is a genuine free lunch: HIBP's public API is CC BY
4.0, and its author is explicit that charging for it as part of a broader
offering is fine. The licence's condition is attribution — *"clear and visible
attribution with a link to haveibeenpwned.com ... anywhere data from the
service is used"*.

The provenance block named the source but carried no link, which does not
satisfy CC BY. It now emits `source_url` and `license` alongside `source`.

## The rule this should have followed

"Free and keyless" answers *can I call it*. It does not answer *may I sell what
it returns*. For a platform whose entire product is reselling lookups, the
second question is the one that matters, and it belongs in the manifest before
the executor is written — beside `data_source`, where `data_source_type`
already lives.

Concretely, for any new capability: find the vendor's terms, and record whether
they permit commercial redistribution, before writing code. Government and
open-licence sources (CC0, CC BY, public domain) are the easy yes. A free tier
from a commercial vendor is the default no, because the free tier is how they
segment non-paying users away from exactly this use.
