---
doc_type: creative-brief
authority_scope: none
program: brand-website
status: proposed-for-founder-review
date: 2026-09-06
---

# One homepage story: useful work without another integration project

**Recommendation:** show a task becoming a useful result, then explain why the next kind of task is easier to add through Strale. Make execution information the way a developer can inspect that work. Useful work creates the reason to connect; shared access creates the reason to choose Strale; scoped evidence helps the developer use it with confidence.

This is proposed copy and art direction for review, within [DEC-20260905-A](../../strategy/2026-09-05-brand-direction-adoption.md). It does not approve publication, commission assets or authorise more section implementation. The [reset handoff](../../../handoff/_general/from-code/2026-09-06-brand-narrative-reset.md) records why the previous opening was set aside. Hero B and the accepted kit remain the visual baseline.

## The argument, read as a whole

You are building an agent that needs to work with information outside its conversation: an invoice to read, a company to look up, an address to check. Each job needs a tool that accepts the relevant input and returns something the agent can use. Strale supplies those tools through shared access, so adding another kind of job does not require you to build another provider integration. You still choose the tools, handle their different inputs and decide how the agent uses the results. For calls made through an account, you can inspect the Strale transaction to see what that tool returned. Start with one task that matters in your application, inspect its requirements and price, and make the first call.

**When this distinction matters:** several kinds of external work in one agent, or an agent whose tool needs are still changing. Direct integration can be sensible for one specialist service whose advanced controls you need. The case for Strale is avoiding repeated provider connection work across supported tools. We have no measured time-saving comparison, no universal coverage claim and no evidence of the largest customer's buying motive.

The page should leave a developer able to say: “I can give my agent those functions through Strale, keep my workflow, and inspect the calls on the account route.” It should not leave them merely remembering that Strale has a large catalogue.

## Proposed page copy in reading order

### 1. Hero — the work

**Tools for AI agents**

**Your agent has work to do.**

Read an invoice. Look up a company. Check an email address. Give your agent the tools through Strale, without connecting each provider yourself.

**Explore tools** · Read the docs

Example title: **An invoice image becomes fields your agent can use.**

Example caption: **Illustrative example · Invoice image extraction**

### 2. Breadth — the next kind of work

**An invoice today. A company lookup tomorrow.**

Choose tools for the work your agent needs to do. Use them separately or combine their results in your own workflow.

Three compact, linked examples:

- **Read an invoice image** — Extract the supplier, invoice number and total.
- **Look up a Swedish company** — Request company details using its organisation number.
- **Check an email address** — Check its format and domain's mail records.

**Browse all tools**

### 3. Integration — why use Strale for this?

**Add a tool without adding a provider integration.**

Use Strale's API or MCP connection to call different tools. Change the tool and its inputs; keep the connection. Your agent decides what happens next.

**See how to connect**

Diagram caption: **Separate calls through the same Strale connection.**

### 4. Inspection — what did the tool return?

**Go back to the call.**

For account API and authenticated MCP calls, use the transaction ID to retrieve the tool's input, output, status and price.

**See an execution record**

Example caption: **Illustrative account API record · Retrieval still to be verified**

### 5. Begin — one task to try

**Start with a job on your list.**

Find the tool, check its inputs and price, then follow the connection guide. Use an API key, connect through MCP, or pay per request with x402 where supported.

**Explore tools** · Read the docs

These are proposed destinations by purpose, not assertions that the redesign has already implemented them. Tool detail supplies current availability, inputs, outputs, limitations, price and eligible access routes. The connection guide leads to a first call; it must not force account creation onto eligible x402 use. “See an execution record” needs a qualified, redacted example before it can be a public link.

## Section and illustration briefs

### 1. Make the result understandable before explaining the infrastructure

**Reader's question:** What useful work can this give my agent? **One benefit:** turn a readable invoice image into fields the agent can work with. This earns the opening because the input and result can be understood without knowing a protocol or trusting a performance claim. The headline is deliberately conversational; the body and visual must make it concrete immediately.

**Illustration objective:** show a change in representation, from information positioned on a document to named, usable values. Use the existing synthetic [invoice PNG](../../../archive/sessions/2026-09-06-brand-kit-launch-proof/invoice-fixture.png): Example Studio, INV-1042, EUR 480.00. Within B's off-white reading panel, place a legible crop of the actual invoice beside a short field list. Align three numbered annotations on the source with the corresponding supplier, invoice-number and total rows. Keep the document flat and readable. The numbers communicate visual correspondence, not source citations returned by the API.

The displayed result is a **proposed illustrative mapping**: Supplier → `vendor_name`, Invoice → `invoice_number`, Total → `total_amount` plus `currency`. The total is a numeric amount and separate currency in the API, formatted for reading here. Do not draw an invented “approved for payment” result. The useful change is that another program can address the values separately; accounting actions and the agent's decisions are outside the picture.

**Medium:** existing fixture image plus editable vector annotations and typeset fields. A static two-part composition is sufficient. No generated bitmap, fake dashboard, spinning loader or animation is needed. Narrow layout reads source crop, then fields; retain the matching numbers and meaningful caption. Suggested alternative text: “Illustrative extraction: supplier Example Studio, invoice INV-1042 and total EUR 480.00 are matched from an invoice image to named fields.”

**Evidence and detail:** [invoice executor](../../../apps/api/src/capabilities/invoice-extract.ts), [manifest](../../../manifests/invoice-extract.yaml), and [qualification](PROOF-QUALIFICATION.md). Source supports the intended fields, not a captured successful result or guaranteed complete schema. This example is image-only; PDF and invoice-process remain outside scope. Input encoding, null handling, extraction limitations and price belong on tool detail. The hero omits transport options, record metadata and technical badges so the transformation can lead.

### 2. Establish breadth without turning the page into a feature inventory

**Transition:** the reader understands one useful result; now show that the relationship extends to other work. **Reader's question:** Is this only for invoices? **One benefit:** choose several kinds of tools in the same library.

**Illustration objective:** show that different jobs have different inputs and returns. Use a short open list, with each row following `input → named tool → kind of result`: invoice image → invoice extraction → invoice fields; organisation number → Swedish company lookup → company details; email address → email validation → format and mail-record checks. The invoice row is a small callback to the hero, not a second large illustration. These are separate examples, not a supplier-onboarding chain. Do not connect the invoice's fictional supplier to a real company record.

**Medium:** a compact vector/typeset comparison, each row also a tool-detail link. Here “company details” is an output category, with no invented company, status or address. Likewise do not show a successful mail-record lookup for a fictional domain. On mobile keep each input/tool/output relationship together; no carousel. Alternative text should name the three independent tasks. No motion is warranted.

**Evidence and detail:** invoice sources above; [Swedish company manifest](../../../manifests/swedish-company-data.yaml) and [executor](../../../apps/api/src/capabilities/swedish-company-data.ts); [email manifest](../../../manifests/email-validate.yaml) and [executor](../../../apps/api/src/capabilities/email-validate.ts). Verify current tool availability before publication. An email check does not establish mailbox existence or delivery. Country coverage, detailed fields and validation limits belong in tool detail. The list earns its place by preventing invoice-only positioning; catalogue counts, popularity rankings and a full category grid would dilute this job.

### 3. Show which integration work stays shared

**Transition:** breadth raises the cost question. **Reader's question:** Why use this instead of connecting the providers myself? **One benefit:** reuse Strale access as the selected tool changes.

**Illustration objective:** make the invariant visible. Two stacked call examples share one aligned `Your agent → Strale` connection. The first names `invoice-extract` with image input; the second names `swedish-company-data` with organisation-number input. The destination and inputs change; the Strale entry point stays fixed. A separate return path carries each tool's own result to the agent. Label the examples as separate calls. Do not imply one call invokes multiple tools, identical schemas, automatic workflow creation or zero application integration.

**Medium:** editable vector, using the accepted [shared-access companion](../../../design/brand-kit/quiet-material/illustrations/README.md) as the construction source. Its existing branch diagram is useful but needs this specific contrast to carry the argument. Preserve its accepted graphic vocabulary. A future user-controlled switch could highlight only the changed tool/input, but the first version should be static and fully understandable. On mobile repeat the shared entry-point label on each call rather than stretching a tiny network across the screen.

**Evidence and detail:** [MCP execute wrapper](../../../packages/mcp-server/src/tools.ts) sends selected slug and inputs to `/v1/do`; [account route](../../../apps/api/src/routes/do.ts) supplies the common execution entry point. Different tool schemas remain visible. Protocol installation, authentication, payment mechanics, errors and complete request examples belong in the connection guide. The visual demonstrates a technical relationship, not measured savings. It earns its scale because this is the reason to choose Strale over repeated direct connections.

### 4. Inspect the same piece of work

**Transition:** delegating a tool call raises a concrete question about what happened. **Reader's question:** Where can I inspect this Strale call? **One benefit:** retrieve the account transaction associated with a result.

**Illustration objective:** connect a response's transaction ID to the record retrieved using that same ID. Return to the hero's invoice example, in a plain annotated response/record excerpt. Highlight the identifier correspondence, then show where input, output, status and price occur. For review use placeholders for the ID, status and price; never fabricate a completed event, timestamp, charge or source observation. The current caption must stay visible beside the concept.

**Medium:** product-derived text excerpt with vector annotation, not a dashboard or receipt certificate. This should be a quieter, narrower section. Before drawing the final excerpt, run the existing qualification procedure and use the observed, redacted wire shape. If retrieval fails, leave the concept blocked and revise or omit this section before publication. Do not silently substitute an x402 response. On mobile show response ID immediately above matching record ID, followed by only the selected record fields. No animation or collapsible disclosure should be required to understand the scope.

**Evidence and detail:** [owner transaction route](../../../apps/api/src/routes/transactions.ts), [MCP wrapper](../../../packages/mcp-server/src/tools.ts) and [proof boundaries](PROOF-QUALIFICATION.md). Source-supported, awaiting live execution and own-record retrieval. API fields use `price_cents`; convert money explicitly for display. Input/output availability is subject to retention/redaction; exact behaviour belongs in the record documentation. Do not use the internally stored execution receipt, claim field-level provenance, show an entire agent trace or promise equivalent x402 retrieval. This section earns its place as a practical follow-up to the call, not as a claim that audit features drive customer demand.

### 5. Turn recognition into a first call

**Transition:** the reader has a reason to try a tool and knows what to inspect. **Reader's question:** How do I start with my task? **One benefit:** a clear route from tool selection to execution.

**Visual objective and medium:** no new illustration. Reuse the accepted closing composition with short copy and a clear primary action. The catalogue and tool-detail destinations do the explanatory work. A second diagram, product montage or repeated invoice would add no information. On narrow screens retain the same action priority. The existing atmosphere may supply a closing brand moment using its accepted role and crop; it must not imply a product outcome.

**Evidence and detail:** [adopted conversion journey](POSITIONING-BRIEF.md), [platform facts source](../../../apps/api/src/lib/platform-facts.ts), [x402 catalogue route](../../../apps/api/src/routes/x402-gateway-v2.ts). Availability, price and x402 eligibility must be bound to their current sources when implemented. No static price range, free-credit promise or “charged only on success” footer. The ending earns its place by moving the reader to a concrete tool, with access guidance at the point it is useful.

## Visual reference lock and editorial choices

The exact [founder screenshot](../../../design/brand-kit/quiet-material/baseline/evidence/founder-hero.png) and [B capture](../../../design/brand-kit/quiet-material/hero-comparison/output/refined-desktop.png) control the appearance: broad folded atmosphere, generous scale, substantial Spectrum frame, B's inset/off-white panel/padding, flowing S, Instrument Sans and IBM Plex Mono. Keep atmosphere outside the explanatory role. The original copy, forbidden sign-in control and example contents are not part of that acceptance. Tokens and historical screenshots remain untouched.

Live Refero research on 6 September used developer integration, open editorial illustration and Stripe queries, then read full references for Firecrawl, Stripe and PencilBooth. These are reference interpretations, not verified conversion results or a new visual direction:

| Choice | Source and bounded contribution | What transfers |
|---|---|---|
| Result before infrastructure | Reset handoff; Refero Firecrawl, `fb006358-22e1-4000-9d43-9e081b7a6bda`, [source](https://www.firecrawl.dev) | Product-centric explanation and clear input/action relationship; no palette, font, button or card tokens. |
| Separate atmosphere from product evidence | Accepted kit; Refero Stripe, `ff64110d-58dd-4e18-a500-0a95073943b1`, [source](https://stripe.com) | Distinct brand atmosphere and contained product demonstration; no Stripe gradients or UI styling. |
| Open, compact breadth section | Positioning brief; Refero PencilBooth, `aad5f82b-57a4-4c88-a4cf-1fdffef6781a`, [source](https://www.pencilbooth.com) | Content-led list rhythm; no colour/type/spacing values. |
| Concrete source/result correspondence | Invoice source and fixture; Refero bundled copywriting guide's scene principle | Show where the useful values come from; the annotations are editorial explanation, not API citations. |
| One main illustration per argument | Reset handoff and bundled anti-slop guidance | Hero transformation, compact breadth, shared-connection contrast, quiet record excerpt, no new closing artwork. |

The pace is a strong framed opening, compact open breadth, one explanatory diagram, a quieter technical excerpt, then an action. Do not turn these into five equal panels. The same source/value correspondence and shared-versus-changed relationship can later support social and documentation assets, but this pass commissions neither.

## Review and next step

Review the argument and illustration objectives together: does the first example make the work tangible, does the second keep the offer broad, and does the shared-connection diagram give a convincing reason to use Strale? The record concept must remain subordinate and accurately scoped. Successful lint or source review cannot answer whether the page is persuasive.

Recommendation for approval: this single sequence and its communication objectives, with the proposed copy above. Founder review precedes new section design or asset production, as requested in the reset handoff and this session. After that review, qualify the chosen live example, resolve any copy changes, and design the approved compositions within B and the accepted kit. Proof, rights and production-adoption gates remain open.
