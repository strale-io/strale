/**
 * Facilitator selection matrix — the Bazaar facilitator switch.
 *
 * `resolveFacilitatorSelection` decides which facilitator processes verify and
 * settle. That is a money-path decision, so every cell of the matrix is pinned
 * here rather than left to be inferred from the implementation.
 *
 * Three properties matter most, and each has a dedicated test below:
 *
 *  1. **Deploying the switch moves no traffic.** The default mode ("auto")
 *     reproduces the pre-switch rule exactly (mainnet + CDP keys → CDP, else
 *     the HTTP facilitator). Shipping this change without setting
 *     X402_FACILITATOR must be a no-op.
 *  2. **Rollback does not require deleting credentials.**
 *     X402_FACILITATOR=legacy pins the HTTP facilitator even when CDP keys are
 *     present. Under the old implicit rule the only way back was to remove the
 *     keys from Railway.
 *  3. **A half-configured cutover fails loudly.** @coinbase/x402 happily builds
 *     an unauthenticated config when keys are absent, which would 401 on every
 *     paid call at settle time — after the capability has already run. Mode
 *     "cdp" without both keys throws at resolve time instead.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  resolveFacilitatorSelection,
  CDP_FACILITATOR_URL,
  DEFAULT_LEGACY_FACILITATOR_URL,
  type FacilitatorEnv,
} from "./x402-gateway.js";

const KEYS: FacilitatorEnv = {
  CDP_API_KEY_ID: "test-key-id",
  CDP_API_KEY_SECRET: "test-key-secret",
};

const MAINNET: FacilitatorEnv = { X402_NETWORK: "base" };
const TESTNET: FacilitatorEnv = { X402_NETWORK: "base-sepolia" };

describe("resolveFacilitatorSelection — mode 'auto' (default)", () => {
  it("defaults to auto when X402_FACILITATOR is unset", () => {
    expect(resolveFacilitatorSelection({}).mode).toBe("auto");
  });

  it("treats an empty / whitespace value as unset rather than erroring", () => {
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "" }).mode).toBe("auto");
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "   " }).mode).toBe("auto");
  });

  // The four cells below ARE the pre-switch rule. If any of them changes,
  // deploying the switch with no env set would move production traffic.
  it("mainnet + CDP keys → CDP", () => {
    const s = resolveFacilitatorSelection({ ...MAINNET, ...KEYS });
    expect(s.kind).toBe("cdp");
    expect(s.url).toBe(CDP_FACILITATOR_URL);
  });

  it("mainnet without CDP keys → legacy", () => {
    expect(resolveFacilitatorSelection(MAINNET).kind).toBe("legacy");
  });

  it("testnet with CDP keys → legacy (network gate preserved)", () => {
    expect(resolveFacilitatorSelection({ ...TESTNET, ...KEYS }).kind).toBe("legacy");
  });

  it("testnet without CDP keys → legacy", () => {
    expect(resolveFacilitatorSelection(TESTNET).kind).toBe("legacy");
  });

  it("defaults the network to base-sepolia, so a bare env is legacy", () => {
    const s = resolveFacilitatorSelection(KEYS);
    expect(s.kind).toBe("legacy");
    expect(s.url).toBe(DEFAULT_LEGACY_FACILITATOR_URL);
  });

  it("recognises the CAIP-2 spelling of Base mainnet", () => {
    const s = resolveFacilitatorSelection({ X402_NETWORK: "eip155:8453", ...KEYS });
    expect(s.kind).toBe("cdp");
  });
});

describe("resolveFacilitatorSelection — mode 'cdp' (rollout target)", () => {
  it("selects CDP on mainnet", () => {
    const s = resolveFacilitatorSelection({ X402_FACILITATOR: "cdp", ...MAINNET, ...KEYS });
    expect(s.kind).toBe("cdp");
    expect(s.url).toBe(CDP_FACILITATOR_URL);
  });

  it("selects CDP on testnet too, so the switch can be rehearsed before prod", () => {
    const s = resolveFacilitatorSelection({ X402_FACILITATOR: "cdp", ...TESTNET, ...KEYS });
    expect(s.kind).toBe("cdp");
  });

  it("never reports the legacy URL, even when X402_FACILITATOR_URL is set", () => {
    // Regression guard for the surface bug this change also fixed: discovery
    // documents must advertise the facilitator that actually settles, so the
    // selection's URL has to come from the selection and not the env var.
    const s = resolveFacilitatorSelection({
      X402_FACILITATOR: "cdp",
      X402_FACILITATOR_URL: "https://x402.org/facilitator",
      ...MAINNET,
      ...KEYS,
    });
    expect(s.url).toBe(CDP_FACILITATOR_URL);
  });

  it("throws when both CDP credentials are missing", () => {
    expect(() => resolveFacilitatorSelection({ X402_FACILITATOR: "cdp", ...MAINNET })).toThrow(
      /CDP_API_KEY_ID and CDP_API_KEY_SECRET/,
    );
  });

  it("throws when only the key id is set", () => {
    expect(() =>
      resolveFacilitatorSelection({
        X402_FACILITATOR: "cdp",
        CDP_API_KEY_ID: "id-only",
        ...MAINNET,
      }),
    ).toThrow(/CDP_API_KEY_ID and CDP_API_KEY_SECRET/);
  });

  it("throws when only the secret is set", () => {
    expect(() =>
      resolveFacilitatorSelection({
        X402_FACILITATOR: "cdp",
        CDP_API_KEY_SECRET: "secret-only",
        ...MAINNET,
      }),
    ).toThrow(/CDP_API_KEY_ID and CDP_API_KEY_SECRET/);
  });

  it("treats whitespace-only credentials as missing", () => {
    // Railway variables that were "cleared" by blanking the field arrive as
    // empty or whitespace strings, not as undefined.
    expect(() =>
      resolveFacilitatorSelection({
        X402_FACILITATOR: "cdp",
        CDP_API_KEY_ID: "  ",
        CDP_API_KEY_SECRET: "",
        ...MAINNET,
      }),
    ).toThrow(/CDP_API_KEY_ID and CDP_API_KEY_SECRET/);
  });
});

describe("resolveFacilitatorSelection — mode 'legacy' (rollback lever)", () => {
  it("pins the legacy facilitator even on mainnet with CDP keys present", () => {
    // The whole point of the lever: rolling back must not require deleting
    // credentials from Railway.
    const s = resolveFacilitatorSelection({ X402_FACILITATOR: "legacy", ...MAINNET, ...KEYS });
    expect(s.kind).toBe("legacy");
    expect(s.url).toBe(DEFAULT_LEGACY_FACILITATOR_URL);
  });

  it("honours a custom X402_FACILITATOR_URL", () => {
    const s = resolveFacilitatorSelection({
      X402_FACILITATOR: "legacy",
      X402_FACILITATOR_URL: "https://facilitator.example.test",
      ...MAINNET,
      ...KEYS,
    });
    expect(s.url).toBe("https://facilitator.example.test");
  });

  it("falls back to the default URL when X402_FACILITATOR_URL is blank", () => {
    const s = resolveFacilitatorSelection({
      X402_FACILITATOR: "legacy",
      X402_FACILITATOR_URL: "   ",
    });
    expect(s.url).toBe(DEFAULT_LEGACY_FACILITATOR_URL);
  });
});

describe("resolveFacilitatorSelection — input handling", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "  CDP  ", ...KEYS }).kind).toBe("cdp");
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "Legacy" }).kind).toBe("legacy");
  });

  it("throws on an unknown mode rather than silently defaulting", () => {
    // A typo'd value must not quietly resolve to auto — that would look like a
    // successful cutover while settlement stayed on the old facilitator.
    expect(() => resolveFacilitatorSelection({ X402_FACILITATOR: "coinbase" })).toThrow(
      /must be one of auto \| cdp \| legacy/,
    );
  });

  it("reports the configured mode back, so the boot log can state it", () => {
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "legacy" }).mode).toBe("legacy");
    expect(resolveFacilitatorSelection({ X402_FACILITATOR: "cdp", ...KEYS }).mode).toBe("cdp");
  });
});

/**
 * Discovery surfaces must advertise the facilitator that actually settles.
 *
 * `/x402/catalog` and `/.well-known/x402.json` both used to read
 * `process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator"`
 * directly. Once mode=cdp is live that would publish x402.org while payments
 * settled through CDP — a lie in the two documents every x402 scanner reads.
 *
 * No HTTP harness exists for x402-gateway-v2.ts, so this is a source-static
 * check in the style of x402-gateway-v2.settlement-order.test.ts
 * (DEC-20260504-A test-harness exemption).
 */
describe("x402 discovery surfaces", () => {
  const __dirname_ = dirname(fileURLToPath(import.meta.url));
  const GATEWAY_V2 = resolve(__dirname_, "../routes/x402-gateway-v2.ts");

  it("do not hardcode a facilitator URL", () => {
    const source = readFileSync(GATEWAY_V2, "utf-8");
    const codeLines = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
    expect(codeLines.join("\n")).not.toContain("X402_FACILITATOR_URL");
  });

  it("read the facilitator from the resolved selection", () => {
    const source = readFileSync(GATEWAY_V2, "utf-8");
    // Once in /x402/catalog, once in getX402Manifest (/.well-known/x402.json).
    const uses = source.match(/facilitator:\s*getFacilitatorUrl\(\)/g) ?? [];
    expect(uses.length).toBe(2);
  });
});
