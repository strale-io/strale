# Vendor Control Tower, vendor economics, and internal test-consumption audit

Date: 2026-08-25
Scope: runtime vendors that can stop or materially raise the cost of a Strale execution, plus the internal scheduler that consumes their allowances.

## Executive conclusion

OpenRegister did not reject a payment. The production account is on its free plan and reached its hard allowance: `500 included / 500 used / 0 remaining`, with the vendor reporting a rolling reset at `2026-09-06T23:40:04.613Z` (01:40 Stockholm on 7 September). A normal German name lookup consumes 11 credits (one autocomplete plus one company profile), so the allowance funds about 45 complete executions, not 500.

The immediate safe action is to withdraw `german-company-data` and the three active German bundles that require it, then restore their exact prior serving state only after `GET /v1/credits` reports usable credits. The free plan is not economical for the observed demand, but a paid OpenRegister plan must not be accepted without founder approval. The direct capability price is corrected from €0.05 to €0.20; that covers the marginal overage cost, but the €59 fixed subscription only breaks even at roughly 295 paid Strale calls per month and should not be activated below that forecast.

## What the control tower covers

- A vendor account is separate from endpoint health. A zero-cost 401 can prove that an API is reachable; it cannot prove that the authenticated account can buy an answer.
- OpenRegister and Browserless have authenticated, zero-cost balance adapters. They are polled hourly.
- Serper has no documented balance API. Strale keeps a conservative local usage ledger and watches the known six-month expiry.
- Dilisense, Anthropic, and CDP are not prepaid hard-balance services. Their account records state their billing model; authenticated failures and existing spend/settlement instrumentation remain the relevant controls.
- Every metered Serper, Dilisense, and OpenRegister HTTP call now passes through a shared preflight. A blocking account state refuses the request before network spend or customer charging. Auth, quota, and rate failures update the same account record.
- Required capabilities and every active solution containing them are reversibly suspended on exhaustion or credential rejection. Restoration is provider-confirmed and marker-protected: later human, legal, or quality action wins.
- The morning routine runs `npm run vendor:status`. It reports low/exhausted accounts, stale balance readings, monitor failures, approaching prepaid expiry, dependency-inventory gaps, and all automatic capability/solution suspensions.

## Vendor economics and alternatives

### German company data

Current OpenRegister list pricing is Free €0 for 500 credits, Pro €59/month for 5,000 credits plus €0.01 per extra credit, and Business €249/month for 30,000 credits. Autocomplete costs one credit and company details ten. Sources: [OpenRegister API pricing](https://openregister.de/api), [credit costs](https://docs.openregister.de/pricing), and the [zero-cost credits endpoint](https://openregister.de/changelog/credits-endpoint).

At 11 credits per Strale execution:

| Option | Approximate variable cost per complete lookup | Fit |
|---|---:|---|
| OpenRegister Free | €0, but only ~45 complete calls per rolling period | Keep as the immediate no-spend option; tower prevents overselling |
| OpenRegister Pro | ~€0.13 at 454 calls/month; ~€0.11 per overage lookup | Operationally strongest known contract; the €0.20 price covers variable cost, but the subscription needs ~295 paid calls/month to recover its fixed fee and requires founder approval |
| Implisense Free/self-service | Resolve and suggest are free; core profile is 1 Implicent. Free includes 100 once + 25/month; packs start at €49/500 | Best commercial candidate to fixture-test; narrower stated coverage (2.3M active companies) than OpenRegister (4M+) and still uses top-up credits |
| Direct Handelsregister per-call parsing | No vendor fee | Not a general production replacement: the official rules limit use to 60 searches/lookups per hour, forbid systematic retrieval to build/update a parallel register, and the portal is operationally hostile to automation |

Implisense publishes its endpoint costs and €49/500 pack on its [API](https://implisense.com/de/produkte/api/) and [platform pricing](https://implisense.com/de/produkte/platform/) pages. The official Handelsregister rules are on the [Registerportal information page](https://www.handelsregister.de/rp_web/information/welcome.xhtml). The community-maintained BundesAPI wrapper is open source, but it inherits the portal limit and fragility; its own [repository](https://github.com/bundesAPI/handelsregister) repeats the 60/hour constraint.

Recommendation: keep OpenRegister through the September reset, do not buy Pro yet, and run a frozen-fixture field/identity comparison against Implisense before any vendor decision. Opening an Implisense account or accepting terms is founder-gated and was not done in this session.

### Web search

Serper remains the cheapest transparent option for the platform's Google-shaped result contracts: the current pack is approximately $50 for 50,000 searches (~$1/1,000), but is prepaid and expires after six months. Alternatives are card/PAYG but materially dearer: Brave Search is $5/1,000 with $5 monthly credit, Exa is $7/1,000, and Tavily PAYG is $0.008 per credit (normally one basic search credit). Sources: [Serper](https://serper.dev/), [Brave Search API](https://brave.com/search/api/), [Exa API pricing](https://exa.ai/pricing?tab=api), and [Tavily pricing](https://www.tavily.com/pricing).

Recommendation: keep Serper; use the tower's local ledger and 30-day/7-day expiry alerts. The inconvenience of top-ups does not currently justify a 5–8× unit-cost increase.

### Browser rendering

Browserless Free includes 1,000 units/month and exposes a programmatic usage endpoint. The account reported 959 units remaining when checked. Browserless documents one unit per 30 seconds plus proxy/CAPTCHA unit costs and the usage endpoint in its [unit-consumption guide](https://docs.browserless.io/overview/unit-consumption); its [pricing](https://cloud.browserless.io/pricing) lists 1,000 free units and paid subscriptions.

Cloudflare Browser Run is the best future card/PAYG candidate: the Workers Free allowance is 10 browser minutes/day; Workers Paid includes 10 hours/month and then charges $0.09/hour. Its quick actions cover HTML, PDF, screenshot and scrape. Sources: [Cloudflare Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/) and [Browser Rendering API](https://developers.cloudflare.com/api/resources/browser_rendering/). Browserbase starts at a $20/month developer plan; its accountless x402 gateway is PAYG but settles in crypto, not the preferred card rail. Source: [Browserbase pricing](https://www.browserbase.com/pricing).

Recommendation: keep Browserless Free. The problem was Strale's test scheduler, not vendor pricing or capacity. Revisit Cloudflare only if real customer use exceeds the free allowance after the scheduler fix.

### AML screening

Dilisense already matches the desired commercial shape: 100 free calls/month, then €0.10 per call, no monthly fee, and adding a card raises the monthly quota to 10,000. Sources: [Dilisense pricing](https://dilisense.com/en/products/aml-screening-api) and [developer limits](https://developers.dilisense.com/).

OpenSanctions is the credible comparison at the same €0.10 per successful match/search with no contract lock-in, but commercial use requires a data license and offers no clear unit saving. Sources: [OpenSanctions metering](https://www.opensanctions.org/faq/api/metering/) and [API commercial terms](https://www.opensanctions.org/docs/api/). ComplyAdvantage starts at $99/month and is a worse economic fit at current volume.

Recommendation: keep Dilisense. A switch would add compliance validation and licensing work without a demonstrated price advantage.

### AI, embeddings, and email

- Anthropic is already actual-usage monthly billing with major cards/invoicing, not a fixed subscription. Use cheaper models for simple work, prompt caching for repeated context, and Batch for non-urgent work (50% token discount). Source: [Anthropic pricing](https://docs.anthropic.com/en/docs/about-claude/pricing).
- Voyage's current `voyage-3.5-lite` use sits inside a published 200M-token free allowance; subsequent billing is usage-based and charged monthly to a card. Source: [Voyage pricing](https://docs.voyageai.com/docs/pricing).
- Resend Free includes 3,000 emails/month and 100/day. Paid plans are subscriptions with card-billed overages, so there is no prepaid balance to top up. Sources: [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) and [pricing](https://resend.com/pricing?product=transactional).

## Internal testing consumption

Production read-only measurements for 5–25 August found:

- 350,778 scheduler run-log rows and 295,577 test results.
- €203.13 recorded actual test cost over 21 days. Following the 18 August fixture work, daily recorded cost fell from roughly €9.44–€13.05 to roughly €5.77–€6.03, still close to the €50/week operating envelope.
- `german-company-data` ran one live schema suite 96 times from 5–12 August. Together with normal traffic this exhausted the 500-credit OpenRegister allowance.
- `screenshot-url` and `html-to-pdf` each ran a live schema suite roughly hourly: 169 combined live schema executions in seven days, in addition to their known-answer canaries.
- Nine duplicate active-suite groups remain; four groups are byte-for-byte identical definitions. The earlier per-suite scheduler fix prevents the former N² execution bug, but cleanup remains worthwhile. The vendor-costing duplicates are presently protected by ineligibility or hard budgets.

Changes shipped in this session:

- Finite-cost live/canary suites use the declared risk cadence: tier A every 6h, B every 24h, C every 72h. Zero-cost fixtures and free-unlimited suites retain their hourly regression signal.
- Finite free quotas get at least a 24h floor; paid-with-free-tier accounts get a 72h floor.
- Internal allowance caps fell from 10%/20% to 5% for free quotas and 2% for paid-with-free-tier quotas. German testing is therefore capped at two complete executions (22 vendor credits) per rolling period.
- Corrected the monthly counter lookup before the vendor's reset day; it previously checked a future window and could fail to see the current counter.
- Piggyback suites are structurally excluded from scheduled dispatch.
- Retired the two redundant Browserless live schema suites while retaining known-answer canaries and fixtures.
- Added fixture-only coverage for the German HRB-number and canonical-company-ID entry paths, closing the capability readiness gap without spending credits.
- Paid/prepaid providers remain prohibited from CI, health-probe, and internal-test execution; only zero-cost authentication/reachability and balance endpoints are scheduled.

## Follow-up, without new commitments

1. After OpenRegister restores, collect a week of genuine demand under the €0.20 price and the two-test cap. That determines whether any paid plan has a business case.
2. If German demand justifies a comparison, use Implisense's free allowance for a frozen-fixture identity/field-reliability trial. Do not switch on price alone.
3. Add usage adapters for any future provider before it can be classified as a required paid dependency. The morning inventory-gap check makes omissions visible immediately.
4. Clean up the four byte-identical active suite groups in a separate, bounded data-quality change; they no longer pose an uncontrolled paid-token risk.
