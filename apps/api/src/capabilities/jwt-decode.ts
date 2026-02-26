import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("jwt-decode", async (input: CapabilityInput) => {
  const token = ((input.token as string) ?? (input.jwt as string) ?? (input.task as string) ?? "").trim();
  if (!token) throw new Error("'token' (JWT string) is required.");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format. Expected 3 parts separated by dots.");

  function decodeBase64Url(str: string): string {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;

  try {
    header = JSON.parse(decodeBase64Url(parts[0]));
  } catch {
    throw new Error("Failed to decode JWT header.");
  }

  try {
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    throw new Error("Failed to decode JWT payload.");
  }

  // Extract common claims
  const iat = payload.iat as number | undefined;
  const exp = payload.exp as number | undefined;
  const nbf = payload.nbf as number | undefined;

  const now = Math.floor(Date.now() / 1000);

  return {
    output: {
      header,
      payload,
      issued_at: iat ? new Date(iat * 1000).toISOString() : null,
      expires_at: exp ? new Date(exp * 1000).toISOString() : null,
      not_before: nbf ? new Date(nbf * 1000).toISOString() : null,
      is_expired: exp ? now > exp : null,
      time_until_expiry_seconds: exp ? exp - now : null,
      issuer: (payload.iss as string) ?? null,
      subject: (payload.sub as string) ?? null,
      audience: payload.aud ?? null,
      algorithm: (header.alg as string) ?? null,
      token_type: (header.typ as string) ?? null,
      claims: Object.keys(payload),
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
