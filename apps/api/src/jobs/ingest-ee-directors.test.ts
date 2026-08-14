/**
 * Regression tests for the EE-directors ingest building blocks.
 *
 * These cover the parts that don't need a Postgres / Railway / RIK
 * end-to-end: the JSON-array streaming tokenizer, the DD.MM.YYYY date
 * parser, and the row-shape filter. The orchestration (`runIngestOnce`)
 * is integration-territory and is exercised separately via the live
 * smoke documented in the PR description.
 *
 * Per DEC-20260504-A — every cert-audit / extraction follow-up needs at
 * least one regression test capturing the structural shape of the fix.
 * Here the shape is: bounded memory streaming + DD.MM date conversion +
 * OSAN-shareholder filter.
 */

import { describe, expect, it } from "vitest";
import {
  JsonArrayObjectStreamer,
  parseEeDate,
  shapeRow,
} from "./ingest-ee-directors.js";

describe("parseEeDate", () => {
  it("converts DD.MM.YYYY → YYYY-MM-DD", () => {
    expect(parseEeDate("05.06.2023")).toBe("2023-06-05");
    expect(parseEeDate("19.11.2009")).toBe("2009-11-19");
    expect(parseEeDate("01.01.2000")).toBe("2000-01-01");
  });

  it("returns null for empty / null / undefined / malformed", () => {
    expect(parseEeDate(null)).toBeNull();
    expect(parseEeDate(undefined)).toBeNull();
    expect(parseEeDate("")).toBeNull();
    expect(parseEeDate("   ")).toBeNull();
    expect(parseEeDate("2023-06-05")).toBeNull(); // ISO is not the upstream shape
    expect(parseEeDate("5.6.2023")).toBeNull(); // missing leading zeros
    expect(parseEeDate("garbage")).toBeNull();
  });
});

describe("JsonArrayObjectStreamer", () => {
  function collectAll(streamer: JsonArrayObjectStreamer, chunks: string[]): unknown[] {
    const out: unknown[] = [];
    for (const chunk of chunks) {
      for (const obj of streamer.push(chunk)) {
        out.push(obj);
      }
    }
    return out;
  }

  it("yields top-level objects from a simple array", () => {
    const s = new JsonArrayObjectStreamer();
    const out = collectAll(s, ['[{"a":1},{"a":2},{"a":3}]']);
    expect(out).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("handles nested objects + arrays inside an entity", () => {
    const s = new JsonArrayObjectStreamer();
    const input = `[
      {"kood":1, "kaardile_kantud_isikud":[{"kirje_id":7,"r":"JUHL"}], "x":{"y":"z"}},
      {"kood":2, "kaardile_kantud_isikud":[]}
    ]`;
    const out = collectAll(s, [input]);
    expect(out).toHaveLength(2);
    expect((out[0] as { kood: number }).kood).toBe(1);
    expect((out[1] as { kood: number }).kood).toBe(2);
    expect(
      (out[0] as { kaardile_kantud_isikud: Array<{ kirje_id: number }> })
        .kaardile_kantud_isikud[0].kirje_id,
    ).toBe(7);
  });

  it("handles braces inside string values (no false-positive object boundary)", () => {
    const s = new JsonArrayObjectStreamer();
    const tricky = '[{"text":"contains } closing brace","n":1},{"text":"{open","n":2}]';
    const out = collectAll(s, [tricky]);
    expect(out).toEqual([
      { text: "contains } closing brace", n: 1 },
      { text: "{open", n: 2 },
    ]);
  });

  it("handles escaped quotes inside string values", () => {
    const s = new JsonArrayObjectStreamer();
    const tricky = '[{"text":"a \\"quoted\\" word","n":1}]';
    const out = collectAll(s, [tricky]);
    expect(out).toEqual([{ text: 'a "quoted" word', n: 1 }]);
  });

  it("works when object spans multiple chunk boundaries", () => {
    const s = new JsonArrayObjectStreamer();
    // Split mid-string, mid-object, and mid-brace to exercise the state machine.
    const out = collectAll(s, [
      '[{"name":"He',
      'llo","items":[1,2,',
      "3]},",
      '{"name":"World"}]',
    ]);
    expect(out).toEqual([
      { name: "Hello", items: [1, 2, 3] },
      { name: "World" },
    ]);
  });

  it("does not grow buffer unboundedly across many objects", () => {
    const s = new JsonArrayObjectStreamer();
    const objs: unknown[] = [];
    for (let i = 0; i < 1000; i++) {
      for (const o of s.push(`,{"i":${i},"pad":"${"x".repeat(50)}"}`)) {
        objs.push(o);
      }
    }
    expect(objs).toHaveLength(1000);
    // Internal buffer post-yield should be empty because every object closed.
    // Touch a private to assert — kept loose since the assertion is mostly
    // a smoke check that trimming actually happened.
    const buf = (s as unknown as { buf: string }).buf;
    expect(buf.length).toBeLessThan(100);
  });
});

describe("shapeRow", () => {
  const basePerson = {
    kirje_id: 12345,
    kaardi_piirkond: 5,
    kaardi_nr: 1,
    kaardi_tyyp: "R",
    kande_nr: 1,
    isiku_tyyp: "F",
    isiku_roll: "JUHL",
    isiku_roll_tekstina: "Juhatuse liige",
    eesnimi: "Markus",
    nimi_arinimi: "Villig",
    isikukood_hash: "abc-uuid",
    isikukood_registrikood: null,
    valis_kood: null,
    valis_kood_riik: null,
    valis_kood_riik_tekstina: null,
    synniaeg: null,
    osamaks: null,
    osamaksu_valuuta: null,
    osamaksu_valuuta_tekstina: null,
    volituste_loppemise_kpv: "",
    aadress_riik: null,
    aadress_riik_tekstina: null,
    aadress_ehak: null,
    aadress_ehak_tekstina: "",
    aadress_tanav_maja_korter: null,
    aadress_postiindeks: null,
    algus_kpv: "05.06.2023",
    lopp_kpv: null,
    email: null,
    aadress_ads__adr_id: null,
    aadress_ads__ads_oid: null,
    aadress_ads__ads_normaliseeritud_taisaadress: null,
    aadress_ads__ads_normaliseeritud_taisaadress_tapsustus: null,
    aadress_ads__koodaadress: null,
    aadress_ads__adob_id: null,
    aadress_ads__tyyp: null,
  };

  it("shapes a natural-person board member", () => {
    const row = shapeRow("12417834", basePerson);
    expect(row).not.toBeNull();
    expect(row!.kirje_id).toBe(12345);
    expect(row!.entity_reg_code).toBe("12417834");
    expect(row!.person_type).toBe("F");
    expect(row!.role_code).toBe("JUHL");
    expect(row!.role_text).toBe("Juhatuse liige");
    expect(row!.first_name).toBe("Markus");
    expect(row!.last_name).toBe("Villig");
    expect(row!.start_date).toBe("2023-06-05");
    expect(row!.end_date).toBeNull();
  });

  it("filters out OSAN (shareholder) — not a representative", () => {
    const shareholder = { ...basePerson, isiku_roll: "OSAN", isiku_roll_tekstina: "Osanik" };
    expect(shapeRow("12417834", shareholder)).toBeNull();
  });

  it("filters out ASUTAJA (founder, historical)", () => {
    const founder = { ...basePerson, isiku_roll: "ASUTAJA" };
    expect(shapeRow("12417834", founder)).toBeNull();
  });

  it("filters out rows with no name (no first, no last)", () => {
    const nameless = { ...basePerson, eesnimi: null, nimi_arinimi: null };
    expect(shapeRow("12417834", nameless)).toBeNull();
  });

  it("handles legal-entity directors (isiku_tyyp = 'J', name in nimi_arinimi)", () => {
    const corpDirector = {
      ...basePerson,
      isiku_tyyp: "J",
      eesnimi: null,
      nimi_arinimi: "Some Holdings OÜ",
    };
    const row = shapeRow("12417834", corpDirector);
    expect(row).not.toBeNull();
    expect(row!.person_type).toBe("J");
    expect(row!.last_name).toBe("Some Holdings OÜ");
    expect(row!.first_name).toBeNull();
  });

  it("preserves the resignation date when present", () => {
    const resigned = { ...basePerson, lopp_kpv: "31.12.2024" };
    const row = shapeRow("12417834", resigned);
    expect(row).not.toBeNull();
    expect(row!.end_date).toBe("2024-12-31");
  });

  it("forward-compat: passes through unknown role codes (not in excluded set)", () => {
    const unknown = { ...basePerson, isiku_roll: "FUTURE_CODE", isiku_roll_tekstina: "Some role" };
    const row = shapeRow("12417834", unknown);
    expect(row).not.toBeNull();
    expect(row!.role_code).toBe("FUTURE_CODE");
  });

  it("rejects rows with no kirje_id", () => {
    const bad = { ...basePerson, kirje_id: undefined as unknown as number };
    expect(shapeRow("12417834", bad)).toBeNull();
  });
});
