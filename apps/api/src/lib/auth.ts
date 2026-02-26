import { createHash, randomBytes } from "node:crypto";

// Generate a new API key: sk_live_ + 32 random hex chars
export function generateApiKey(): string {
  const random = randomBytes(32).toString("hex");
  return `sk_live_${random}`;
}

// Hash an API key for storage (SHA-256)
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Extract the prefix for lookup (first 8 chars after sk_live_)
export function getKeyPrefix(key: string): string {
  return key.slice(0, 16); // "sk_live_" + first 8 of random = 16 chars
}
