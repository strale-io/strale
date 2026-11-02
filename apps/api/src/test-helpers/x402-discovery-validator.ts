import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/** Offline subset of CDP preflight + Bazaar specification (read 2026-10-27):
 * https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint
 * https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md
 * The hosted validator is an API, not a published npm validator. Reuse the
 * protocol SDK's envelope parser and Bazaar's published Ajv algorithm, plus published service
 * metadata rules. Network reachability, payment simulation, content moderation,
 * image decoding and indexing/ranking cannot be reproduced offline.
 * Output examples are advisory; privacy/schema omissions must remain acceptable.
 */
export function validateOfflineDiscovery(challenge: unknown): string[] {
  const body = challenge as any;
  const failures: string[] = [];
  const parsed = PaymentRequiredV2Schema.safeParse(body);
  if (!parsed.success) failures.push(`v2 envelope: ${parsed.error.message}`);
  const extension = body?.extensions?.bazaar;
  if (extension) {
    const inputSchema = extension.schema?.properties?.input;
    const input = extension.info?.input;
    if (!extension.schema?.required?.includes("input") || !inputSchema || inputSchema.properties?.type?.const !== "http" || !inputSchema.required?.includes("type") || !inputSchema.required?.includes("method")) failures.push("missing HTTP input schema contract");
    const methods = ["POST", "PUT", "PATCH"].includes(input?.method) ? ["POST", "PUT", "PATCH"] : ["GET", "HEAD", "DELETE"];
    if (["POST", "PUT", "PATCH"].includes(input?.method) &&
      (!inputSchema?.required?.includes("body") || !inputSchema?.required?.includes("bodyType") || !Object.hasOwn(input ?? {}, "body"))) failures.push("POST discovery requires body and bodyType");
    const declaredMethods = inputSchema?.properties?.method?.enum;
    if (!methods.includes(input?.method) || !Array.isArray(declaredMethods) || !declaredMethods.length || declaredMethods.some((method: string) => !methods.includes(method))) failures.push("invalid HTTP method contract");
    try {
      // Same draft/algorithm as @x402/extensions validateDiscoveryExtension,
      // with standard formats enabled (the SDK otherwise ignores formats).
      const ajv = new Ajv2020({ strict: false, allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(extension.schema);
      if (!validate(extension.info)) failures.push(ajv.errorsText(validate.errors));
    } catch (error) {
      failures.push(`invalid Bazaar schema: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (extension.schema?.$schema !== "https://json-schema.org/draft/2020-12/schema") failures.push("Bazaar requires draft 2020-12");
    const refs = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (["$ref", "$id"].includes(key) && (typeof item !== "string" || !item.startsWith("#"))) failures.push("external schema reference");
        refs(item);
      }
    };
    refs(extension.schema);
  }
  const ascii = (value: unknown) => typeof value === "string" && /^[\x20-\x7e]{1,32}$/.test(value);
  const resource = body?.resource;
  // Required by Strale's D2 quality gate although optional in the protocol.
  if (!ascii(resource?.serviceName)) failures.push("missing/invalid serviceName");
  const tags = resource?.tags;
  if (!Array.isArray(tags) || tags.length > 5 || !tags.every(ascii) || new Set(tags.map((tag: string) => tag.toLowerCase())).size !== tags.length) failures.push("missing/invalid tags");
  try {
    const icon = new URL(resource?.iconUrl);
    const host = decodeURIComponent(icon.hostname).toLowerCase();
    if (!/^https?:$/.test(icon.protocol) || icon.username || icon.password || /[\x00-\x1f\x7f]/.test(resource.iconUrl) || resource.iconUrl.length > 2048 || /^(localhost|localhost\.localdomain|ip6-localhost|ip6-loopback|[\d.]+|0x[\da-f]+)$/.test(host) || host.includes(":")) failures.push("invalid iconUrl");
  } catch { failures.push("missing/invalid iconUrl"); }
  return failures;
}
