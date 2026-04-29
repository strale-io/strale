# Dilisense Reseller agreement + Mirko correspondence (2026-04-29)

**Intent:** Preserve the vendor correspondence and Reseller Service Agreement reference for fast retrieval when an upgrade trigger fires. Do NOT proactively engage Mirko; this is a reactive-trigger artifact only.

## Vendor contact

- **Mirko Heinbuch**, Client Success Team, dilisense GmbH
- Email: `mirko@dilisense.com`
- Generic intake: `info@dilisense.com`
- Address: Weinbergstrasse 131, 8006 Zurich, Switzerland; reg CHE-406.519.053
- Data centre: AWS Frankfurt (eu-central-1)

## What's confirmed in writing (2026-04-28)

> "Usually the Reselling Plans start with the Basic Plan as we only provide from that plan onwards a Service Agreement for Reseller and Data Processing Agreement. I understand that you are in an early start-up phase, so we can accept this short period under the assumption that you will switch to a higher plan soon."

Translation:
- Strale's embedded-bundle use IS reselling per Dilisense's classification.
- Basic+ is the formal entry tier for reseller (gives SA + DPA).
- Mirko granted **informal grace** for Strale to remain on Starter "for a short period" pending upgrade. Grace is verbal-by-email, not contractual.

## Reseller Service Agreement — material terms (full doc shared by Mirko)

Stored in the email thread for retrieval. Key clauses for future reference:

- **§4 Resale.** Strale acts in own name, not as Dilisense agent. Customers consume Strale's API, not Dilisense's directly. Wrapping permitted; pass-through forbidden.
- **§4.1.4** — "Client shall not grant its Customers direct access to the API or to the Service, but may include results received from the Service in the results of its own services." Our `/v1/do?slug=sanctions-check` and `/x402/sanctions-check` patterns satisfy this — both wrap.
- **§5.2.3** — No bulk collection / scraping of Dilisense data. Audit-trail of specific enquiries OK; building a derived dataset NOT OK. **Implication for caching:** any future response cache keyed by identity is a gray zone — must clarify with Mirko before adding. Storing per-call responses in `transactions.audit_trail` for the call that produced them is fine.
- **§4.5 Reseller pricing.** Confidential — must not disclose to third parties.
- **§4.7 Indemnification.** Strale indemnifies Dilisense from third-party claims arising from Strale's services.
- **§8 SLA.** 99% uptime, 5s avg response, Sev 1 reaction 1h (24/7), Sev 2 reaction 2h Mon–Fri 08:00–17:00 CET, Sev 3 reaction 72h.
- **§11 Liability.** Capped at 12 months of fees paid. **Strale bears residual risk on bad sanctions data.** Customer ToS should reflect.
- **§12 Fees.** Annual increases capped at max(4%, Swiss CPI). 6-month notice on amendments.
- **§13–14 Term.** 3-month minimum, auto-renew in 3-month increments, 90-day notice for termination for convenience.
- Governing law: Switzerland; jurisdiction: Zurich.

Annex 2 (price + included calls + overage rate) is blank and TBD — needs negotiation when upgrade triggers.

## Re-evaluation triggers (when to engage Mirko)

Engage proactively only when one of the following fires:

1. **Monthly Dilisense bill > €100** — implies Strale is past Starter's free tier and paying real money. Time to negotiate Basic terms with actual volume data.
2. **Regulated customer asks for Strale's DPA** — Dilisense DPA is a sub-processor reference; Strale needs the formal Dilisense Reseller agreement to flow through cleanly.
3. **Mirko initiates upgrade conversation** — he holds the cadence on this; he'll ping when his side decides Strale is past grace.
4. **Quality/outage incident** — if Dilisense data quality regresses or an outage exceeds SLA, the conversation is reactive but unavoidable.
5. **12 months elapsed (April 2027)** — annual review even if no other trigger has fired.

When a trigger fires, the upgrade ask is straightforward: request Basic-tier pricing for Strale's then-current monthly volume, sign Reseller SA + DPA, set `Annex 2` price + included calls + overage.

## Customer-facing implications

- **ToS / customer agreement should reflect Dilisense liability cap pass-through.** Sanctions/PEP results provided "as-is from upstream sources"; Strale's liability for false negatives capped consistent with §11. Currently undocumented in customer terms; flag for review when Strale has actual paying customers.
- **Caching policy** — current sync-call pattern is clean. Do not introduce response caching as a cost optimization without §5.2.3 clarification with Mirko.

## Where the full email thread lives

Mirko's email of 2026-04-28 (subject: "API Starter plan — reseller use case confirmation") and the attached Reseller Service Agreement (Google Doc link Mirko shared) are in Petter's inbox. Full text quoted in the session transcript that produced this handoff (2026-04-29).
