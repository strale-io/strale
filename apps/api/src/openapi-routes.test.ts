import { expect, it } from "vitest";
import { app } from "./app.js";
import { openApiSpec } from "./openapi.js";
import { internalRoutes } from "./openapi-internal-routes.js";
import { routeCoverage } from "./openapi-route-coverage.js";
it("every documented operation exists and every endpoint is documented or explicitly excluded", () => {
  for (const entry of internalRoutes) expect(entry.reason.length).toBeGreaterThan(20);
  expect(routeCoverage(app.routes, openApiSpec.paths, internalRoutes)).toEqual({ nonexistent: [], undocumented: [], staleExclusions: [] });
});
it("rejects planted undocumented GET and ALL handlers and nonexistent spec operations", () => {
  const extra = [{ method: "GET", path: "/v1/new-public" }, { method: "ALL", path: "/v1/new-transport" }, { method: "ALL", path: "/v1/capabilities" }];
  const result = routeCoverage([...app.routes, ...extra], { ...openApiSpec.paths, "/v1/nonexistent": { get: {} } }, internalRoutes);
  expect(result.undocumented).toEqual(["GET /v1/new-public", "ALL /v1/new-transport", "ALL /v1/capabilities"]);
  expect(result.nonexistent).toEqual(["GET /v1/nonexistent"]);
});
