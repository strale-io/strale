import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normaliseFnr,
  parseAuszug,
  parseSearchResults,
} from "./austrian-company-data.js";

// Fixture is the verbatim AUSZUG_V2 (UMFANG=Kurzinformation) response for
// OMV Aktiengesellschaft (FN 93363 z), captured live 2026-08-27 with the
// IWG token issued that day. Re-capture: see the curl command in the
// executor header comment; the endpoint requires X-API-KEY even for reads.
// Officer names and birth dates in both fixtures are pseudonymized (structure,
// titles, and the whitespace-padded PNR join keys are verbatim).
const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);
const auszugXml = readFileSync(
  join(fixturesDir, "at-firmenbuch-auszug-omv.xml"),
  "utf-8",
);
// NIKI Luftfahrt GmbH (FN 230533 w): still registered, but dissolved via
// insolvency — carries three current RECHTSTATSACHE legal facts.
const nikiXml = readFileSync(
  join(fixturesDir, "at-firmenbuch-auszug-niki.xml"),
  "utf-8",
);

describe("normaliseFnr", () => {
  it("accepts the canonical display form", () => {
    expect(normaliseFnr("FN 93363 z")).toEqual({
      fnr: "093363z",
      formatted: "FN 93363 z",
    });
  });

  it("accepts padded, unpadded, hyphenated, and case variants", () => {
    for (const raw of ["093363z", "93363z", "fn93363z", "FN 93363-Z"]) {
      expect(normaliseFnr(raw)?.fnr).toBe("093363z");
    }
  });

  it("rejects VAT numbers — the old WW-Top contract must not silently pass", () => {
    expect(normaliseFnr("ATU14189108")).toBeNull();
  });

  it("rejects empty input and overlong digit runs", () => {
    expect(normaliseFnr("")).toBeNull();
    expect(normaliseFnr("1234567z")).toBeNull();
    expect(normaliseFnr("93363")).toBeNull();
  });
});

// Verbatim SUCHEFIRMA response for the exact search "OMV Aktiengesellschaft",
// captured live 2026-08-27 (namespace declarations trimmed).
const searchXml = `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body><ns14:SUCHEFIRMARESPONSE ns14:REQUEST_EXAKTESUCHE="true" ns14:REQUEST_FIRMENWORTLAUT="OMV Aktiengesellschaft" ns14:REQUEST_GERICHT="" ns14:REQUEST_ORTNR="" ns14:REQUEST_RECHTSEIGENSCHAFT="" ns14:REQUEST_RECHTSFORM="" ns14:REQUEST_SUCHBEREICH="1"><ns14:ERGEBNIS><ns14:FNR>093363z</ns14:FNR><ns14:STATUS/><ns14:NAME>OMV Aktiengesellschaft</ns14:NAME><ns14:SITZ>Wien</ns14:SITZ><ns14:RECHTSFORM><ns14:CODE>AG </ns14:CODE><ns14:TEXT>Aktiengesellschaft</ns14:TEXT></ns14:RECHTSFORM><ns14:RECHTSEIGENSCHAFT/><ns14:GERICHT><ns14:CODE>007</ns14:CODE><ns14:TEXT>Handelsgericht Wien</ns14:TEXT></ns14:GERICHT></ns14:ERGEBNIS></ns14:SUCHEFIRMARESPONSE></env:Body></env:Envelope>`;

describe("parseSearchResults", () => {
  it("extracts FNR, name, seat, and legal form from a hit", () => {
    const hits = parseSearchResults(searchXml);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      fnr: "093363z",
      name: "OMV Aktiengesellschaft",
      seat: "Wien",
      legal_form: "Aktiengesellschaft",
    });
  });

  it("returns no hits for an empty result envelope", () => {
    const empty = searchXml.replace(/<ns14:ERGEBNIS>[\s\S]*<\/ns14:ERGEBNIS>/, "");
    expect(parseSearchResults(empty)).toHaveLength(0);
  });
});

describe("parseAuszug (OMV Kurzinformation fixture)", () => {
  const parsed = parseAuszug(auszugXml);

  it("extracts the company core fields", () => {
    expect(parsed.company_name).toBe("OMV Aktiengesellschaft");
    expect(parsed.address).toBe("Trabrennstraße 6-8, 1020 Wien");
    expect(parsed.seat).toBe("Wien");
    expect(parsed.legal_form).toBe("Aktiengesellschaft");
    expect(parsed.legal_form_code).toBe("AG");
    expect(parsed.court).toBe("Handelsgericht Wien");
    expect(parsed.court_code).toBe("007");
    expect(parsed.legal_facts).toEqual([]);
  });

  it("extracts registration history and identifiers", () => {
    expect(parsed.first_registered_date).toBe("1944-03-10");
    expect(parsed.historical_registration_number).toBe("HRB 29493");
    expect(parsed.euid).toBe("ATBRA.093363-000");
    expect(parsed.homepage).toBe("www.omv.com");
    expect(parsed.source_checksum).toBe("AE5C3FA050D3B445A9488BF39C4CA3EE");
    expect(parsed.source_as_of).toContain("2026-08-27");
  });

  it("joins FUN roles to PER persons via the whitespace-padded PNR key", () => {
    expect(parsed.representatives).toHaveLength(10);
    const roles = new Set(parsed.representatives.map((r) => r.role));
    expect(roles).toEqual(new Set(["VORSTAND", "PROKURIST/IN"]));
    const first = parsed.representatives.find((r) =>
      r.name.includes("Beispielmann"),
    );
    expect(first).toMatchObject({
      type: "person",
      name: "Dr. Anna Beispielmann, MBA",
      date_of_birth: "1970-12-16",
    });
    // Every current officer must resolve to a person with a start date.
    for (const r of parsed.representatives) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps representation authority text on the officer entry", () => {
    const withRepr = parsed.representatives.filter((r) => r.representation);
    expect(withRepr.length).toBeGreaterThan(0);
    expect(withRepr[0]!.representation).toContain("vertritt");
  });

  it("drops officers whose FU_DKZ10 block is not current", () => {
    const withdrawn = auszugXml.replace(
      /<ns6:FU_DKZ10 ns6:AUFRECHT="true"/,
      '<ns6:FU_DKZ10 ns6:AUFRECHT="false"',
    );
    expect(parseAuszug(withdrawn).representatives).toHaveLength(9);
  });

  it("survives an amended entry: historical block before the current one", () => {
    // Duplicate the name block as a preceding AUFRECHT="false" version — the
    // parser must return the current name, not the first block it sees.
    const amended = auszugXml.replace(
      /<ns6:FI_DKZ02 ns6:AUFRECHT="true"([^>]*)><ns6:BEZEICHNUNG>[^<]*<\/ns6:BEZEICHNUNG>/,
      '<ns6:FI_DKZ02 ns6:AUFRECHT="false"$1><ns6:BEZEICHNUNG>Old Name AG</ns6:BEZEICHNUNG></ns6:FI_DKZ02>$&',
    );
    expect(parseAuszug(amended).company_name).toBe("OMV Aktiengesellschaft");
  });

  it("decodes XML entities in extracted text", () => {
    const withEntity = auszugXml.replace(
      "OMV Aktiengesellschaft",
      "M&#252;ller &amp; S&#246;hne GmbH",
    );
    expect(parseAuszug(withEntity).company_name).toBe("Müller & Söhne GmbH");
  });

  it("does not corrupt names containing colon-uppercase sequences", () => {
    const colonName = auszugXml.replace(
      "OMV Aktiengesellschaft",
      "TEAM:WORK Handels GmbH",
    );
    expect(parseAuszug(colonName).company_name).toBe("TEAM:WORK Handels GmbH");
  });
});

describe("parseAuszug (NIKI dissolved-company fixture)", () => {
  const parsed = parseAuszug(nikiXml);

  it("still parses core fields for a dissolved-but-registered company", () => {
    expect(parsed.company_name).toBe("NIKI Luftfahrt GmbH");
    expect(parsed.legal_form_code).toBe("GES");
  });

  it("extracts current legal facts with decoded umlauts", () => {
    expect(parsed.legal_facts).toHaveLength(3);
    const codes = parsed.legal_facts.map((f) => f.code);
    expect(codes).toContain("0930"); // KONKURS eröffnet
    expect(codes).toContain("0938"); // aufgelöst
    const dissolution = parsed.legal_facts.find((f) => f.code === "0938");
    expect(dissolution?.text).toContain("aufgelöst");
  });
});
