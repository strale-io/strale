/**
 * Regression tests for sendAlert (2026-08 review of the 2026-07-02
 * incident fix).
 *
 * The bug shape: Resend reports most failures IN-BAND as `{ error }` on a
 * resolved promise (invalid key, quota exhausted, unverified sender
 * domain) rather than by throwing. sendAlert ignored that field, logged
 * "alerting-sent", and returned as if the page went out. Because this
 * email is the only page on fatal startup, a mis-set key meant the
 * founder was never told the service was down — while logs claimed the
 * alert was sent. These tests fail against the un-fixed version (which
 * returned void and never inspected `error`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

async function freshSendAlert() {
  vi.resetModules();
  const mod = await import("./alerting.js");
  return mod.sendAlert;
}

describe("sendAlert", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
  });

  it("returns true when Resend accepts the email", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });
    const sendAlert = await freshSendAlert();
    await expect(
      sendAlert({ subject: "s", body: "b", severity: "critical" }),
    ).resolves.toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when Resend reports an in-band error without throwing", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "API key is invalid" },
    });
    const sendAlert = await freshSendAlert();
    await expect(
      sendAlert({ subject: "s", body: "b", severity: "critical" }),
    ).resolves.toBe(false);
  });

  it("returns false when the send call throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("network down"));
    const sendAlert = await freshSendAlert();
    await expect(
      sendAlert({ subject: "s", body: "b", severity: "critical" }),
    ).resolves.toBe(false);
  });

  it("returns false without calling Resend when no API key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const sendAlert = await freshSendAlert();
    await expect(
      sendAlert({ subject: "s", body: "b", severity: "info" }),
    ).resolves.toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
