/**
 * lithuanian-company-data: a failed classifier read must not fail the lookup.
 *
 * From 2026-08-21 every production run failed with "Spinta classifier fetch
 * HTTP 500" while the same requests succeeded from elsewhere. The classifiers
 * only turn a legal-form or status id into its label, so the executor now
 * falls back to a bundled copy of them. Pre-fix, the first test here throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityExecutor } from "./index.js";

const FORMA_ID = "3ea86c95-ee10-4167-a22b-30d7c1ffa670"; // Valstybės įmonė, in the snapshot
const STATUS_ID = "5ef6b364-a5ff-47fb-8600-ff859214ef85"; // Teisinis statusas neįregistruotas

const JA_RECORD = {
  _id: "b6025045-b573-4d71-b193-3770e1f03093",
  ja_kodas: 304151376,
  ja_pavadinimas: 'AB "Energijos skirstymo operatorius"',
  pilnas_adresas: null,
  reg_data: "2015-12-11",
  isreg_data: null,
  forma: { _id: FORMA_ID },
  statusas: { _id: STATUS_ID },
  stat_data: "2015-12-11",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function freshExecutor(): Promise<CapabilityExecutor> {
  vi.resetModules();
  const { getDirectExecutor } = await import("./index.js");
  await import("./lithuanian-company-data.js");
  return getDirectExecutor("lithuanian-company-data")!;
}

describe("lithuanian-company-data classifiers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("answers from the bundled snapshot when the classifier read returns HTTP 500", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("formos_statusai") ? json({ error: "x" }, 500) : json({ _data: [JA_RECORD] }),
    );
    const exec = await freshExecutor();
    const { output, provenance } = await exec({ company_code: "304151376" });
    expect(output.company_code).toBe("304151376");
    expect(output.legal_form).toBe("Valstybės įmonė");
    expect(output.legal_form_en).toBe("State Enterprise");
    expect(output.status).toBe("Teisinis statusas neįregistruotas");
    expect(output.status_en).toBe("No legal proceedings");
    expect(provenance.source_note).toMatch(/copy of the registry's classifiers taken \d{4}-\d{2}-\d{2}/);
  });

  it("does not retry the failed classifier read on every call", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("formos_statusai") ? json({}, 500) : json({ _data: [JA_RECORD] }),
    );
    const exec = await freshExecutor();
    await exec({ company_code: "304151376" });
    const classifierCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("formos_statusai")).length;
    const after1 = classifierCalls();
    await exec({ company_code: "304151376" });
    expect(classifierCalls()).toBe(after1);
  });

  it("prefers the live classifiers when they answer", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/Forma/")) return json({ _data: [{ _id: FORMA_ID, pavadinimas: "LIVE forma", name: "LIVE form" }] });
      if (url.includes("/Statusas/")) return json({ _data: [{ _id: STATUS_ID, pavadinimas: "LIVE statusas", name: "LIVE status" }] });
      return json({ _data: [JA_RECORD] });
    });
    const exec = await freshExecutor();
    const { output, provenance } = await exec({ company_code: "304151376" });
    expect(output.legal_form).toBe("LIVE forma");
    expect(output.status).toBe("LIVE statusas");
    expect(provenance.source_note).not.toMatch(/copy of the registry's classifiers/);
  });

  it("still fails when the register itself fails", async () => {
    fetchMock.mockImplementation(async () => json({}, 500));
    const exec = await freshExecutor();
    await expect(exec({ company_code: "304151376" })).rejects.toThrow(/Lithuanian Open Data Portal returned HTTP 500/);
  });
});

// After the snapshot shipped, the register query itself failed 5/5 from
// production while answering 200 elsewhere. Off sale until production can
// reach it; a DB flag alone would not stop direct executor callers.
describe("lithuanian-company-data availability", () => {
  it("is in DEACTIVATED until the register answers our production host", async () => {
    const { getDeactivatedCapabilities } = await import("./auto-register.js");
    expect(getDeactivatedCapabilities().get("lithuanian-company-data")).toMatch(/production/);
  });
});
