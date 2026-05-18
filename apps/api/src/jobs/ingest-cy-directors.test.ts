/**
 * Regression tests for the CY-directors ingest building blocks.
 *
 * Covers the streaming CSV tokenizer (RFC-4180 quoted fields, doubled-
 * quote escaping, BOM, CRLF/LF terminators), the role-standardization
 * map, and the row-shape filter. The orchestration (`runIngestOnce`) is
 * integration-territory and is exercised separately via the parse-only
 * smoke documented in the PR description.
 *
 * Per DEC-20260504-A — every Phase-6 follow-up needs at least one
 * regression test capturing the structural shape of the fix. Here the
 * shape is: streaming CSV with quoted fields + Greek role
 * standardization + header-row skip.
 */

import { describe, expect, it } from "vitest";
import {
  CsvStreamer,
  ROLE_STANDARDIZATION,
  shapeRow,
  standardizeRole,
} from "./ingest-cy-directors.js";

describe("CsvStreamer", () => {
  function collectAll(streamer: CsvStreamer, chunks: string[]): string[][] {
    const out: string[][] = [];
    for (const chunk of chunks) {
      for (const row of streamer.push(chunk)) {
        out.push(row);
      }
    }
    for (const row of streamer.flush()) {
      out.push(row);
    }
    return out;
  }

  it("parses a simple comma-separated row terminated by LF", () => {
    const out = collectAll(new CsvStreamer(), ["a,b,c\n"]);
    expect(out).toEqual([["a", "b", "c"]]);
  });

  it("parses CRLF row terminators (DRCOR shape)", () => {
    const out = collectAll(new CsvStreamer(), ["a,b,c\r\nd,e,f\r\n"]);
    expect(out).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    const out = collectAll(new CsvStreamer(), ["﻿a,b\r\n"]);
    expect(out).toEqual([["a", "b"]]);
  });

  it("handles empty fields", () => {
    const out = collectAll(new CsvStreamer(), ["a,,c\n,,\n"]);
    expect(out).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("emits a final row without a trailing newline via flush()", () => {
    const out = collectAll(new CsvStreamer(), ["a,b,c"]);
    expect(out).toEqual([["a", "b", "c"]]);
  });

  it("parses quoted fields with embedded commas", () => {
    const out = collectAll(new CsvStreamer(), [
      `"NEAPOLIS, INC",290800,"with, comma"\r\n`,
    ]);
    expect(out).toEqual([["NEAPOLIS, INC", "290800", "with, comma"]]);
  });

  it("parses quoted fields with doubled-quote escaping (the DRCOR ΨΗΣΤΑΡΙΕΣ case)", () => {
    const out = collectAll(new CsvStreamer(), [
      `"ΨΗΣΤΑΡΙΕΣ ""ΤΩΝ ΦΡΟΝΙΜΩΝ ΤΑ ΠΑΙΔΙΑ""",29837,B\r\n`,
    ]);
    expect(out).toEqual([
      [`ΨΗΣΤΑΡΙΕΣ "ΤΩΝ ΦΡΟΝΙΜΩΝ ΤΑ ΠΑΙΔΙΑ"`, "29837", "B"],
    ]);
  });

  it("parses quoted fields with embedded CRLF inside the quote", () => {
    const out = collectAll(new CsvStreamer(), [
      `"line one\r\nline two",b,c\r\n`,
    ]);
    expect(out).toEqual([["line one\r\nline two", "b", "c"]]);
  });

  it("handles row split across multiple chunk boundaries", () => {
    const streamer = new CsvStreamer();
    const out: string[][] = [];
    for (const row of streamer.push("a,b,")) out.push(row);
    for (const row of streamer.push("c\r\nd,e,f")) out.push(row);
    for (const row of streamer.flush()) out.push(row);
    expect(out).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles quoted field split mid-quote across chunks", () => {
    const streamer = new CsvStreamer();
    const out: string[][] = [];
    for (const row of streamer.push(`"ΨΗΣΤΑΡΙΕΣ `)) out.push(row);
    for (const row of streamer.push(`""ΤΩΝ`)) out.push(row);
    for (const row of streamer.push(` ΦΡΟΝΙΜΩΝ""",29837,B\r\n`)) out.push(row);
    expect(out).toEqual([
      [`ΨΗΣΤΑΡΙΕΣ "ΤΩΝ ΦΡΟΝΙΜΩΝ"`, "29837", "B"],
    ]);
  });

  it("parses the DRCOR header row (with BOM) verbatim", () => {
    const out = collectAll(new CsvStreamer(), [
      "﻿ORGANISATION_NAME,REGISTRATION_NO,ORGANISATION_TYPE_CODE,ORGANISATION_TYPE,PERSON_OR_ORGANISATION_NAME,OFFICIAL_POSITION\r\n",
    ]);
    expect(out).toEqual([
      [
        "ORGANISATION_NAME",
        "REGISTRATION_NO",
        "ORGANISATION_TYPE_CODE",
        "ORGANISATION_TYPE",
        "PERSON_OR_ORGANISATION_NAME",
        "OFFICIAL_POSITION",
      ],
    ]);
  });
});

describe("standardizeRole", () => {
  it("maps the documented Greek role labels to English codes", () => {
    expect(standardizeRole("Διευθυντής")).toBe("director");
    expect(standardizeRole("Γραμματέας")).toBe("secretary");
    expect(standardizeRole("Ιδιοκτήτης")).toBe("owner");
    expect(standardizeRole("Ομόρρυθμος Συνέταιρος")).toBe("general_partner");
    expect(standardizeRole("Αντικαταστάτης Διευθυντής")).toBe("alternate_director");
    expect(standardizeRole("Βοηθός Γραμματέας")).toBe("assistant_secretary");
    expect(standardizeRole("Εξουσιοδοτημένο Πρόσωπο")).toBe("authorised_person");
    expect(standardizeRole("Ετερόρρυθμος Συνέταιρος")).toBe("limited_partner");
    expect(standardizeRole("Αναπληρωτής Γραμματέας")).toBe("deputy_secretary");
  });

  it("trims whitespace before mapping", () => {
    expect(standardizeRole("  Διευθυντής  ")).toBe("director");
  });

  it("falls back to 'other' for unknown role labels (forward-compat)", () => {
    expect(standardizeRole("ΝΕΑ ΡΟΛΟΣ")).toBe("other");
    expect(standardizeRole("")).toBe("other");
  });

  it("covers all 9 documented role labels in the standardization map", () => {
    // Guard against accidental deletion. The Phase 6 enumeration partial
    // documents exactly 9 role labels in the role histogram.
    expect(Object.keys(ROLE_STANDARDIZATION).length).toBe(9);
  });
});

describe("shapeRow", () => {
  it("shapes a typical DRCOR director row", () => {
    const out = shapeRow([
      "WARGAMING GROUP LIMITED",
      "290868",
      "C",
      "Εταιρεία",
      "VICTOR KISLYI",
      "Διευθυντής",
    ]);
    expect(out).toEqual({
      entity_reg_code: "290868",
      person_or_organisation_name: "VICTOR KISLYI",
      official_position: "Διευθυντής",
      organisation_name: "WARGAMING GROUP LIMITED",
      organisation_type_code: "C",
      organisation_type: "Εταιρεία",
      role_standardized: "director",
    });
  });

  it("shapes a corporate-nominee secretary row", () => {
    const out = shapeRow([
      "WARGAMING GROUP LIMITED",
      "290868",
      "C",
      "Εταιρεία",
      "THEMIS SECRETARIAL SERVICES LIMITED",
      "Γραμματέας",
    ]);
    expect(out?.role_standardized).toBe("secretary");
    expect(out?.person_or_organisation_name).toBe(
      "THEMIS SECRETARIAL SERVICES LIMITED",
    );
  });

  it("returns null for the header row", () => {
    expect(
      shapeRow([
        "ORGANISATION_NAME",
        "REGISTRATION_NO",
        "ORGANISATION_TYPE_CODE",
        "ORGANISATION_TYPE",
        "PERSON_OR_ORGANISATION_NAME",
        "OFFICIAL_POSITION",
      ]),
    ).toBeNull();
  });

  it("returns null for rows with empty REGISTRATION_NO", () => {
    expect(
      shapeRow(["NAME", "", "C", "Εταιρεία", "PERSON", "Διευθυντής"]),
    ).toBeNull();
  });

  it("returns null for rows with empty person name", () => {
    expect(
      shapeRow(["NAME", "290868", "C", "Εταιρεία", "", "Διευθυντής"]),
    ).toBeNull();
  });

  it("returns null for rows with empty position", () => {
    expect(
      shapeRow(["NAME", "290868", "C", "Εταιρεία", "PERSON", ""]),
    ).toBeNull();
  });

  it("returns null for too-short rows (defensive)", () => {
    expect(shapeRow(["NAME", "290868"])).toBeNull();
    expect(shapeRow([])).toBeNull();
  });

  it("trims whitespace from all fields", () => {
    const out = shapeRow([
      "  WARGAMING GROUP LIMITED  ",
      "  290868  ",
      "  C  ",
      "  Εταιρεία  ",
      "  VICTOR KISLYI  ",
      "  Διευθυντής  ",
    ]);
    expect(out?.entity_reg_code).toBe("290868");
    expect(out?.person_or_organisation_name).toBe("VICTOR KISLYI");
    expect(out?.role_standardized).toBe("director");
  });

  it("nullifies empty optional fields rather than persisting empty strings", () => {
    const out = shapeRow(["", "290868", "", "", "VICTOR KISLYI", "Διευθυντής"]);
    expect(out?.organisation_name).toBeNull();
    expect(out?.organisation_type_code).toBeNull();
    expect(out?.organisation_type).toBeNull();
  });
});
