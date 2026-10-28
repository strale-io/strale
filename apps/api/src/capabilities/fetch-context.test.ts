import { expect, it } from "vitest";
import { registerCapability, getExecutor } from "./index.js";
import { registerDataAccess, currentAcquisitionMethod } from "../lib/data-access.js";
it("H6 executors propagate each manifest's method across awaits without leaking between calls", async () => {
  const methods = ["public_page_read", "customer_directed_fetch", "vendor_api", "direct_api"] as const;
  for (const method of methods) {
    const slug = `h6-context-${method}`;
    registerDataAccess(slug, { lane: "preferred", acquisition_method: method });
    registerCapability(slug, async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      expect(currentAcquisitionMethod()).toBe(method);
      return { output: {}, provenance: { source: "test", fetched_at: new Date().toISOString() } };
    });
  }
  await Promise.all(methods.map(method => getExecutor(`h6-context-${method}`)!({})));
  expect(currentAcquisitionMethod()).toBeUndefined();
});
