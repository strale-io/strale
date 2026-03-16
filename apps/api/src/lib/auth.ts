import { createHash, randomBytes } from "node:crypto";

// Generate a new API key: sk_live_ + 32 random hex chars
export function generateApiKey(): string {
  const random = randomBytes(32).toString("hex");
  return `sk_live_${random}`;
}

// Hash an API key for storage (SHA-256).
// Unsalted SHA-256 is acceptable here because API keys are 256-bit random
// values (sk_live_ + 32 hex bytes), giving sufficient entropy to prevent
// rainbow table attacks. A salted KDF (scrypt/argon2) would be overkill
// given the key space. Timing-safe comparison is used in middleware.
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Extract the prefix for lookup (first 8 chars after sk_live_)
export function getKeyPrefix(key: string): string {
  return key.slice(0, 16); // "sk_live_" + first 8 of random = 16 chars
}
