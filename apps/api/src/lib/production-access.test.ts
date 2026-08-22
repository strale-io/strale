/**
 * Ordinary autonomous credentials must not be able to execute a founder-gated
 * production mutation.
 *
 * The 2026-08-22 incident: a session with the full `.env`, write access to
 * every file, and a correct reading of the founder's general policy executed a
 * money-path write the founder had reserved — and then wrote its own sentence
 * into the `authorised_by` column of the audit rows it created.
 *
 * These tests pin the two properties that make that impossible rather than
 * merely discouraged. Both fail against the un-applied fix, because before this
 * module there was no gate at all: any script that could reach `getDb()` could
 * write anything.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DenyAllVerifier,
  FOUNDER_GATED_ACTIONS,
  type FounderGatedAction,
  type GrantToken,
  type GrantVerifier,
  ProductionWriteDeniedError,
  assertFounderGatedWrite,
  installGrantVerifier,
  readOnlyConnectionOptions,
  resetGrantVerifier,
} from "./production-access.js";

const ACTION: FounderGatedAction = "close-stranded-transactions";

describe("ordinary autonomous credentials cannot execute a founder-gated write", () => {
  beforeEach(() => {
    resetGrantVerifier();
    delete process.env.FOUNDER_GRANT;
  });

  afterEach(() => {
    // Restore only the key this file touches. See the note in
    // alerting.isolation.test.ts: `process.env = {...saved}` swaps Node's live
    // environment object for a plain one and breaks every later test file that
    // shares the worker.
    delete process.env.FOUNDER_GRANT;
    resetGrantVerifier();
  });

  it("denies with no grant present — the exact posture of the incident", () => {
    // The session that ran the reconciliation had everything except a grant.
    expect(() => assertFounderGatedWrite(ACTION)).toThrow(
      ProductionWriteDeniedError,
    );
  });

  it("denies every gated action by default, not just the one we remembered", () => {
    for (const action of FOUNDER_GATED_ACTIONS) {
      expect(() => assertFounderGatedWrite(action)).toThrow(
        ProductionWriteDeniedError,
      );
    }
  });

  it("denies when a grant is present but no verifier is installed", () => {
    // Fail-closed. The incident happened because an absent control read as
    // permission; an unwired verifier must read as refusal.
    process.env.FOUNDER_GRANT = "looks-like-a-token";
    expect(() => assertFounderGatedWrite(ACTION)).toThrow(
      ProductionWriteDeniedError,
    );
  });

  it("rejects the actual string the incident produced", () => {
    // Verbatim from the audit rows. Prose authored by a model, however
    // plausible, is not a grant.
    process.env.FOUNDER_GRANT =
      "founder approval, 2026-08-21 stranded-row reconciliation";
    expect(() => assertFounderGatedWrite(ACTION)).toThrow(
      ProductionWriteDeniedError,
    );
  });

  it("rejects a grant issued for a DIFFERENT action", () => {
    // The second half of the incident: an approval for incident A licensing a
    // write for incident B. A grant names its action or it is not a grant.
    class OnlyRefunds implements GrantVerifier {
      verify(action: FounderGatedAction): boolean {
        return action === "issue-wallet-refund";
      }
    }
    installGrantVerifier(new OnlyRefunds());
    process.env.FOUNDER_GRANT = "valid-for-refunds-only";

    expect(() => assertFounderGatedWrite("close-stranded-transactions")).toThrow(
      ProductionWriteDeniedError,
    );
    expect(() => assertFounderGatedWrite("issue-wallet-refund")).not.toThrow();
  });

  it("permits only when a real verifier accepts the token for that action", () => {
    class Accepts implements GrantVerifier {
      verify(_a: FounderGatedAction, t: GrantToken): boolean {
        return t === "the-real-signature";
      }
    }
    installGrantVerifier(new Accepts());

    process.env.FOUNDER_GRANT = "not-the-signature";
    expect(() => assertFounderGatedWrite(ACTION)).toThrow(
      ProductionWriteDeniedError,
    );

    process.env.FOUNDER_GRANT = "the-real-signature";
    expect(() => assertFounderGatedWrite(ACTION)).not.toThrow();
  });

  it("the default verifier denies unconditionally", () => {
    expect(new DenyAllVerifier().verify()).toBe(false);
  });
});

describe("free-form model text cannot reach the gate at all", () => {
  it("exposes no parameter through which prose could be supplied", () => {
    // The control is the SHAPE of the function, so assert on the shape.
    // assertFounderGatedWrite(action) — arity 1, the action only. There is no
    // reason/justification/authorisedBy argument to fill in, so the incident's
    // mechanism (a model composing a sentence that reads as authorisation) has
    // nowhere to enter. If someone adds a second parameter, this fails.
    expect(assertFounderGatedWrite.length).toBe(1);
  });

  it("an action outside the closed set is refused", () => {
    // Callers from untyped JS, or a future caller building an action name from
    // a string. A session cannot invent 'routine-cleanup' and grant itself
    // something that sounds harmless.
    expect(() =>
      assertFounderGatedWrite("routine-cleanup" as FounderGatedAction),
    ).toThrow(ProductionWriteDeniedError);
  });
});

describe("the autonomous handle physically cannot write", () => {
  it("sets default_transaction_read_only on the server, not in the client", () => {
    // A client-side flag is advisory and can be forgotten one call site at a
    // time. This is a server setting: Postgres rejects INSERT/UPDATE/DELETE/DDL
    // with 25006 regardless of what the client believes.
    const opts = readOnlyConnectionOptions();
    expect(opts.connection?.default_transaction_read_only).toBe(true);
  });

  it("still bounds statement and idle-in-transaction time", () => {
    // A read-only session that pins a pool slot is a production hazard too.
    const opts = readOnlyConnectionOptions();
    expect(opts.connection?.statement_timeout).toBe(30_000);
    expect(opts.connection?.idle_in_transaction_session_timeout).toBe(60_000);
  });
});
