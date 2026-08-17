import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

config({ path: resolve(import.meta.dirname, "../../../.env") });
if (!process.env.BROWSERLESS_API_KEY || !process.env.BROWSERLESS_URL) {
  const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
  const text = buf.toString("utf16le");
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  for (const line of clean.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k === "BROWSERLESS_API_KEY" || k === "BROWSERLESS_URL") {
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

const url = process.env.BROWSERLESS_URL;
const key = process.env.BROWSERLESS_API_KEY;
console.log("BROWSERLESS_URL:", url || "(unset)");
console.log("BROWSERLESS_API_KEY:", key ? `${key.slice(0, 6)}...${key.slice(-4)} (len=${key.length})` : "(unset)");
console.log();

if (!url || !key) {
  console.error("Missing BROWSERLESS_URL or BROWSERLESS_API_KEY in env");
  process.exit(1);
}

// Replicate the exact probe in dependency-manifest.ts
const probeUrl = `${url.replace(/\/$/, "")}/content`;
console.log("Probe URL:", probeUrl);

const t0 = Date.now();
try {
  const res = await fetch(probeUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "data:text/html,<html><body>ok</body></html>",
      gotoOptions: { waitUntil: "load", timeout: 8000 },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const dt = Date.now() - t0;
  console.log(`HTTP ${res.status} ${res.statusText} (${dt}ms)`);
  console.log("Response headers:");
  for (const [k, v] of res.headers.entries()) console.log(`  ${k}: ${v}`);
  const text = await res.text();
  console.log("\nBody (first 500 chars):");
  console.log(text.slice(0, 500));
} catch (err: any) {
  const dt = Date.now() - t0;
  console.error(`FAILED after ${dt}ms:`, err.message);
  if (err.cause) console.error("  cause:", err.cause);
}

// Also try GET / and /pressure to see what the service responds with
console.log("\n=== GET / (root) ===");
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/`, { signal: AbortSignal.timeout(8000) });
  console.log(`HTTP ${res.status}`);
  const text = await res.text();
  console.log(text.slice(0, 300));
} catch (e: any) { console.error("err:", e.message); }

console.log("\n=== GET /pressure (Browserless capacity endpoint) ===");
try {
  const res = await fetch(`${url.replace(/\/$/, "")}/pressure?token=${key}`, { signal: AbortSignal.timeout(8000) });
  console.log(`HTTP ${res.status}`);
  const text = await res.text();
  console.log(text.slice(0, 500));
} catch (e: any) { console.error("err:", e.message); }
