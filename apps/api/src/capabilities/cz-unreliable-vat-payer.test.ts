/**
 * How cz-unreliable-vat-payer reads the MF ČR register's reply
 * (promise-audit T1 wave 3).
 *
 * Two answers it got wrong: an unknown DIČ, which the register answers with
 * nespolehlivyPlatce="NENALEZEN" ("not found", checked live 2026-11-12), was
 * reported as a registered VAT payer; and a reply with no status at all (a
 * maintenance or block page served with HTTP 200) was reported, and billed,
 * as "not registered".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import "./cz-unreliable-vat-payer.js";
import { getExecutor } from "./index.js";
import { outcomeFromError } from "../lib/execution-outcome.js";

function soap(inner: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soapenv:Body><StatusNespolehlivyPlatceRozsirenyResponse xmlns="http://adis.mfcr.cz/rozhraniCRPDPH/">${inner}` +
    "</StatusNespolehlivyPlatceRozsirenyResponse></soapenv:Body></soapenv:Envelope>"
  );
}

const OK_STATUS = '<status odpovedGenerovana="2026-11-12" statusCode="0" statusText="OK"/>';

function reply(body: string) {
  vi.stubGlobal("fetch", async () => new Response(body, { status: 200, headers: { "content-type": "text/xml" } }));
}

async function run(dic = "CZ12345679") {
  const fn = getExecutor("cz-unreliable-vat-payer")!;
  return (await fn({ dic })) as { output: Record<string, unknown> };
}

afterEach(() => vi.unstubAllGlobals());

describe("cz-unreliable-vat-payer", () => {
  it("reports an unknown DIČ (NENALEZEN) as not registered", async () => {
    reply(soap(`${OK_STATUS}<statusPlatceDPH dic="12345679" nespolehlivyPlatce="NENALEZEN"/>`));
    const { output } = await run();
    expect(output.is_registered_vat_payer).toBe(false);
    expect(output.is_unreliable_payer).toBeNull();
  });

  it("reports a reliable payer with its published account", async () => {
    reply(
      soap(
        `${OK_STATUS}<statusPlatceDPH dic="12345679" nespolehlivyPlatce="NE" cisloFu="451">` +
          '<zverejneneUcty><ucet datumZverejneni="2020-01-01"><standardniUcet cislo="123" kodBanky="0100"/></ucet></zverejneneUcty>' +
          "</statusPlatceDPH>",
      ),
    );
    const { output } = await run();
    expect(output.is_registered_vat_payer).toBe(true);
    expect(output.is_unreliable_payer).toBe(false);
    expect(output.published_account_count).toBe(1);
  });

  it("throws, unbilled, when the reply carries no status", async () => {
    reply("<html><body><h1>Planned maintenance</h1></body></html>");
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/carried no status/);
    expect(outcomeFromError(err).failure_class).not.toBe("capability_refused");
  });

  it("throws when an OK reply carries no payer status", async () => {
    reply(soap(OK_STATUS));
    await expect(run()).rejects.toThrow(/carried no payer status/);
  });

  it("still throws on a non-zero status code", async () => {
    reply(soap('<status statusCode="2" statusText="Chyba"/>'));
    await expect(run()).rejects.toThrow(/statusCode=2/);
  });
});
