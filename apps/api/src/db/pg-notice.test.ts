import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePgNotice } from "./pg-notice.js";
import { log } from "../lib/log.js";

vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logError: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("handlePgNotice", () => {
  // The boot path runs idempotent DDL, so these arrive in bursts. Each one
  // postgres-js prints itself costs about seven console lines, which is what
  // pushed the replica past Railway's 500/sec limit and made it drop real
  // lines silently.
  it("drops the benign idempotent-DDL notices", () => {
    for (const message of [
      'relation "job_callbacks_due_idx" already exists, skipping',
      'relation "capability_invocations_pkey" already exists, skipping',
      'column "x402_payer_hash" of relation "transactions" already exists, skipping',
      'constraint "capabilities_no_half_quarantine" of relation "capabilities" does not exist, skipping',
    ]) {
      handlePgNotice({ message, code: "42P07" });
    }
    expect(log.info).not.toHaveBeenCalled();
  });

  it("keeps any other notice as one structured line", () => {
    handlePgNotice({
      message: "identifier will be truncated to something",
      code: "42622",
    });
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.info).mock.calls[0][0]).toMatchObject({
      label: "pg-notice",
      code: "42622",
      pg_message: "identifier will be truncated to something",
    });
  });

  it("does not drop a notice that merely mentions existence", () => {
    // "already exists" only earns the drop when postgres actually skipped.
    handlePgNotice({ message: 'table "t" already exists', code: "42P07" });
    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it("survives a notice with no message", () => {
    expect(() => handlePgNotice({ code: "00000" })).not.toThrow();
    expect(log.info).toHaveBeenCalledTimes(1);
  });
});
