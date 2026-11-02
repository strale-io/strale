/** Previously undocumented REST operations. Response bodies remain open here;
 * the handlers own their schemas. Exact paths are checked against Hono. */
const endpoints: Array<[string, string, string]> = [
  ["get", "/v1/capabilities/health", "Read capability health summary"],
  ["get", "/v1/transactions/{id}/verify", "Verify a transaction integrity chain"],
  ["post", "/v1/signup", "Create an agent account with an email address"],
  ["get", "/v1/demand-signals", "Read unmet demand signals"],
  ["get", "/v1/demand-signals/categories", "Read demand signal categories"],
  ["post", "/v1/solutions/{slug}/execute", "Execute a solution"],
  ["get", "/v1/web3-assurance/methodology", "Read Web3 assurance methodology"],
  ["get", "/v1/web3-assurance/source-quality", "Read Web3 source quality"],
  ["get", "/v1/web3-assurance/bridge-config-index", "Read the bridge configuration index"],
  ["get", "/v1/web3-assurance/trust-index", "Read the Web3 trust index"],
  ["get", "/v1/platform/facts", "Read current platform facts"],
  ["get", "/v1/public/ops/tests/capabilities/{slug}", "Read tests capabilities for a slug"],
  ["get", "/v1/public/ops/tests/capabilities/{slug}/history", "Read tests capabilities for a slug history"],
  ["get", "/v1/public/ops/tests/capabilities/{slug}/runs", "Read tests capabilities for a slug runs"],
  ["get", "/v1/public/ops/tests/solutions/{slug}", "Read tests solutions for a slug"],
  ["get", "/v1/public/ops/tests/solutions/{slug}/runs", "Read tests solutions for a slug runs"],
  ["get", "/v1/public/ops/tests/capabilities/{slug}/example-output", "Read tests capabilities for a slug example-output"],
  ["get", "/v1/public/ops/tests/dependency-health/summary", "Read tests dependency-health summary"],
  ["get", "/v1/public/ops/tests/dependency-health/history", "Read tests dependency-health history"],
  ["get", "/v1/public/ops/tests/situations", "Read tests situations"],
  ["get", "/v1/public/ops/limitations/capabilities/{slug}", "Read limitations capabilities for a slug"],
  ["get", "/v1/public/ops/limitations/solutions/{slug}", "Read limitations solutions for a slug"],
  ["get", "/v1/public/ops/events", "Read events"],
  ["get", "/v1/public/ops/onboarding/readiness", "Read onboarding readiness"],
  ["get", "/v1/public/ops/trust/capabilities/batch", "Read trust capabilities batch"],
  ["get", "/v1/public/ops/trust/solutions/batch", "Read trust solutions batch"],
  ["get", "/v1/audit/{transactionId}", "Read a transaction audit record"],
 ];
export const additionalPublicPaths: Record<string, Record<string, unknown>> = {};
for (const [method, path, summary] of endpoints) {
  (additionalPublicPaths[path] ??= {})[method] = {
    summary,
    parameters: [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({ name, in: "path", required: true, schema: { type: "string" } })),
    responses: { default: { description: "Endpoint response; errors use the standard error envelope." } },
  };
}
// Required inputs and auth for the newly documented operations.
const execute = additionalPublicPaths["/v1/solutions/{slug}/execute"].post as Record<string, unknown>;
execute.security = [{ BearerAuth: [] }];
execute.requestBody = { required: true, content: { "application/json": { schema: {
  type: "object", required: ["inputs"], properties: { inputs: { type: "object", additionalProperties: true }, max_price_cents: { type: "integer", minimum: 1 } },
} } } };
for (const path of ["/v1/public/ops/trust/capabilities/batch", "/v1/public/ops/trust/solutions/batch"]) {
  const operation = additionalPublicPaths[path].get as { parameters: unknown[] };
  operation.parameters.push({ name: "slugs", in: "query", required: true, description: "Comma-separated slugs (maximum 100).", schema: { type: "string" } });
}
const signup = additionalPublicPaths["/v1/signup"].post as Record<string, unknown>;
signup.requestBody = { required: true, content: { "application/json": { schema: {
  type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, name: { type: "string" } },
} } } };
signup.responses = { "201": { description: "Agent account created" }, default: { description: "Standard error response" } };
