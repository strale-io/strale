# Strale — Product Strategy and Positioning

## 1. What Strale is

Strale is infrastructure that gives AI agents **one connection to a broad set of useful external tools and data capabilities**.

It is not merely an API marketplace and not merely an MCP server.

The intended product experience is:

- connect once;
- discover the capability needed for a job;
- call it through one interface;
- receive a structured result with useful source/provenance/execution context;
- pay in a machine-compatible way, increasingly through x402.

The clearest current website expression is:

> **One connection to the tools your agent needs.**

The strongest long-term thesis is:

> A machine-native capability layer where an agent can discover a suitable tool, understand its contract and cost, authorize/pay for it, execute it safely, and receive a structured, attributable result without the developer building and maintaining a separate integration for every provider.

## 2. Primary customer

The most important customer is the builder/operator of an agent or automated workflow that repeatedly needs external commercial/data/research capabilities.

Early revenue evidence points strongly to recurring B2B research/commercial-intelligence usage:
- search/SEO;
- company information;
- enrichment;
- competitor research;
- contact discovery;
- email validation;
- geocoding;
- document/image utilities.

Working ICP:

> A developer or operator running an agent that needs multiple external tools repeatedly and values avoiding separate integrations, accounts, credentials and billing relationships.

This is an acquisition wedge, not a mandate to turn Strale into a single vertical product.

## 3. Positioning

Strale should feel:
- practical;
- agent-native;
- broad;
- trustworthy enough for unattended workflows;
- easy to try;
- transparent about cost/outcome;
- self-describing and machine-discoverable.

Avoid positioning as:
- generic AI automation platform;
- workflow builder;
- generic human-browsed API marketplace;
- KYB-only company;
- a random collection of APIs;
- enterprise integration consulting.

## 4. Core product advantages

### One integration surface
A new task should not require a new bespoke integration.

### Discovery
The agent should be able to describe a job and find the right capability.

This is why WP16 Discovery & Retrieval Authority is strategically important.

### Common execution contract
Predictable authorization, payment, schemas, retries/idempotency, failure semantics, provenance and execution records.

### Machine-native payment
x402 is the strategic primary rail. Prepaid/API-key access remains useful, but x402 is central to the machine-buyer thesis.

### Trust/execution evidence
The execution-receipt program created `strale.execution.v1`. Today receipts are internal/chained. Do not claim a customer-facing signed verification product yet.

## 5. Product principles

### Library-as-product
Capability breadth, quality, metadata, discovery and consistency are core product surfaces.

### One authority per business fact
The central architecture/product-operations principle is:

> **One authority per business fact; many thin consumers.**

This should apply to product context as much as backend code.

### Agent-first does not mean agent-only
Humans still need a credible website/docs/trust layer.

### Pay for successful work
Standing principle: do not charge before success.

### Evidence over claims
Do not infer implementation from issue state, customer behavior from incomplete identity data, safety from post-buffer checks, or routing quality from contaminated test results.

## 6. Commercial objective

The explicit target is:

> **$2,000/week revenue**

This superseded the initial $2,000/month framing.

The commercial goals are:
1. increase total weekly revenue;
2. reduce dependence on one buyer by creating multiple recurring buyer habits.

Recent repo evidence shows early progress:
- concentration has fallen materially across comparable complete weeks;
- multiple real buyers now exist;
- some non-top buyers repeat;
- new demand entered via general utilities as well as research/compliance-adjacent tools.

This is progress from a tiny base, not PMF.

## 7. Vertical stance

KYB/compliance was explored as a wedge.

Latest evidence argues against auto-ranking it as the next build:
- new meaningful buyers entered via general utilities;
- the card buyer returned through `competitor-compare`;
- a specific bundle cohort experiment failed.

Therefore build priority should follow observed demand rather than force the platform into a vertical.

## 8. Next strategic product layer

After remaining remediation/governance residuals, the major product/technical program should be WP16:

- WP16.0 discovery containment;
- WP16.1 frozen retrieval benchmark (~200 queries);
- only then retrieval/ranking changes.

Goal:

> an agent can state a job and reliably discover the right Strale capability/solution.
