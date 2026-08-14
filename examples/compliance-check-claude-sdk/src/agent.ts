/**
 * Compliance-check agent — Claude Agent SDK + straleio SDK as in-process tools.
 *
 * Wraps three Strale capabilities (company registry, VAT, PEP screening) as
 * custom tools on an in-process MCP server, hands them to a claude-sonnet-5
 * agent via the Claude Agent SDK's query(), and prints the audit trail that
 * comes back with every Strale transaction -- the differentiator versus a
 * plain API wrapper: every call is independently provenanced and traceable.
 */
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { Strale, StraleError } from "straleio";
import { z } from "zod";

const strale = new Strale({
  apiKey: process.env.STRALE_API_KEY ?? "",
  defaultMaxPriceCents: 50,
});

const auditTrail: Record<string, unknown>[] = [];

// straleio@0.1.2 (the version currently published to npm as of 2026-08) hands
// back the raw /v1/do wire response -- { result: {...}, meta: {...} } -- even
// though its own bundled .d.ts advertises a flat DoResponse (transaction_id,
// output, ... at the top level). The flattening lands in the SDK's next
// release. Read defensively so this works against both the published
// package and the upcoming one -- `meta.audit` is present at the top level
// either way, only `output`'s location differs.
function unwrapOutput(raw: unknown): Record<string, unknown> {
  const r = raw as Record<string, any>;
  return (r.output ?? r.result?.output ?? {}) as Record<string, unknown>;
}

function recordAudit(raw: unknown): void {
  const audit = (raw as Record<string, any>)?.meta?.audit;
  if (audit) auditTrail.push(audit as Record<string, unknown>);
}

/** Shared error-to-tool-result mapping so all three tools report failures the same way. */
function errorResult(err: unknown) {
  const message = err instanceof StraleError ? `${err.errorCode}: ${err.message}` : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const sanctionsPepCheck = tool(
  "sanctions_pep_check",
  "Screen a person or company name against consolidated PEP (politically exposed person) lists (230+ territories, EU C/2023/724-aligned).",
  { name: z.string().describe("Full legal name of the person or company to screen") },
  async (args) => {
    try {
      const raw = await strale.do({
        capability_slug: "pep-check",
        inputs: { name: args.name },
        max_price_cents: 10,
      });
      recordAudit(raw);
      return { content: [{ type: "text" as const, text: JSON.stringify(unwrapOutput(raw), null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

const vatValidate = tool(
  "vat_validate",
  "Validate an EU VAT number via VIES and return the registered company name and address.",
  { vat_number: z.string().describe("EU VAT number including country prefix, e.g. SE556703748501") },
  async (args) => {
    try {
      const raw = await strale.do({
        capability_slug: "vat-validate",
        inputs: { vat_number: args.vat_number },
        max_price_cents: 10,
      });
      recordAudit(raw);
      return { content: [{ type: "text" as const, text: JSON.stringify(unwrapOutput(raw), null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

const companyRegistryCheck = tool(
  "company_registry_check",
  "Look up a Swedish company in the Bolagsverket registry by organisation number (format NNNNNN-NNNN). Does not accept free-text company names -- the underlying registry has no name search.",
  { org_number: z.string().describe("Swedish organisationsnummer, e.g. 556703-7485") },
  async (args) => {
    try {
      const raw = await strale.do({
        capability_slug: "swedish-company-data",
        inputs: { org_number: args.org_number },
        max_price_cents: 10,
      });
      recordAudit(raw);
      return { content: [{ type: "text" as const, text: JSON.stringify(unwrapOutput(raw), null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

const straleServer = createSdkMcpServer({
  name: "strale",
  version: "1.0.0",
  tools: [sanctionsPepCheck, vatValidate, companyRegistryCheck],
});

async function main(): Promise<void> {
  if (!process.env.STRALE_API_KEY) {
    console.error("STRALE_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const company = process.argv[2] ?? "Spotify AB";
  const orgNumber = process.argv[3] ?? "556703-7485";
  const vatNumber = process.argv[4] ?? "SE556703748501";

  const prompt =
    `Run a compliance check on ${company}. Swedish org number ${orgNumber}, ` +
    `VAT number ${vatNumber}. Check the company registry, validate the VAT ` +
    `number, and screen the name against PEP lists. Summarize findings in under 100 words.`;

  for await (const message of query({
    prompt,
    options: {
      model: "claude-sonnet-5",
      mcpServers: { strale: straleServer },
      allowedTools: [
        "mcp__strale__sanctions_pep_check",
        "mcp__strale__vat_validate",
        "mcp__strale__company_registry_check",
      ],
      permissionMode: "bypassPermissions",
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          console.log(`[tool call] ${block.name}`, JSON.stringify(block.input));
        }
      }
    } else if (message.type === "result" && message.subtype === "success") {
      console.log("\n=== SUMMARY ===\n" + message.result);
    }
  }

  console.log(`\n=== AUDIT TRAIL (${auditTrail.length} transactions) ===`);
  console.log(JSON.stringify(auditTrail, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
