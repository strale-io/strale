import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB cap on fetched media
const FETCH_TIMEOUT_MS = 30_000;

// MIME types c2pa-rs/c2pa-node can parse. Keep v1 to images; video/audio later.
const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heif",
  "image/heic",
  "image/tiff",
  "image/gif",
  "image/dng",
  "image/x-adobe-dng",
]);

// Assertion labels that indicate AI/generative provenance, per C2PA spec
// + common vendor extensions (Adobe, CAWG, OpenAI).
const AI_ASSERTION_LABELS = [
  "c2pa.training-mining",
  "cawg.training-mining",
  "c2pa.ai-tool",
  "com.adobe.generative-ai",
  "com.openai.dalle",
];

// Lazy-load c2pa-node — its native binding doesn't load on every platform
// (e.g. Windows-ARM64). Lazy-loading lets registration succeed everywhere
// and only fails at execution time on unsupported platforms.
let c2paInstance: { read: (input: { buffer: Buffer; mimeType: string }) => Promise<unknown> } | null = null;
let c2paLoadError: Error | null = null;
async function getC2pa() {
  if (c2paInstance) return c2paInstance;
  if (c2paLoadError) throw c2paLoadError;
  try {
    const mod = await import("c2pa-node");
    c2paInstance = mod.createC2pa();
    return c2paInstance;
  } catch (err) {
    c2paLoadError = new Error(
      `c2pa-node native binding failed to load on this platform (${process.platform}-${process.arch}). ` +
      `This capability runs on Linux x64, macOS, and Windows x64. Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
    throw c2paLoadError;
  }
}

// ─── Types (subset of c2pa-node ManifestStore / Manifest) ──────────────────

interface ManifestStoreLike {
  active_manifest?: string | null;
  manifests: Record<string, ManifestLike>;
  validation_status?: ValidationStatusLike[] | null;
}

interface ManifestLike {
  assertions?: Array<{ label: string; kind?: string | null; data?: unknown }>;
  claim_generator?: string;
  format?: string;
  ingredients?: Array<unknown>;
  signature_info?: {
    issuer?: string | null;
    cert_serial_number?: string | null;
    time?: string | null;
  } | null;
  title?: string | null;
  vendor?: string | null;
}

interface ValidationStatusLike {
  code: string;
  url?: string | null;
  explanation?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAiGenerated(assertions: ManifestLike["assertions"]): boolean {
  if (!assertions || assertions.length === 0) return false;
  return assertions.some((a) =>
    AI_ASSERTION_LABELS.some((label) => a.label.toLowerCase().includes(label.toLowerCase()))
  );
}

function isSignatureValid(validationStatus: ValidationStatusLike[] | null | undefined): boolean {
  if (!validationStatus || validationStatus.length === 0) return true;
  // Per C2PA spec, success codes are prefixed with the validated component
  // (e.g. "claimSignature.validated"). Failure codes start with the component
  // name and end in a failure word (mismatch, missing, untrusted, etc.).
  return !validationStatus.some((s) => {
    const code = s.code.toLowerCase();
    return (
      code.endsWith(".mismatch") ||
      code.endsWith(".missing") ||
      code.endsWith(".untrusted") ||
      code.endsWith(".malformed") ||
      code.endsWith(".invalid") ||
      code.endsWith(".error")
    );
  });
}

// ─── Executor ───────────────────────────────────────────────────────────────

registerCapability("c2pa-inspect", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? "").trim();
  if (!url) {
    throw new Error("'url' is required. Provide an http(s) URL pointing to a media file (JPEG, PNG, WebP, AVIF, HEIF, TIFF, DNG).");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`'url' is not a valid URL: ${url}`);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`'url' must use http or https protocol (got ${parsedUrl.protocol}).`);
  }

  const resp = await safeFetch(url, {
    headers: {
      "User-Agent": "Strale/1.0 (c2pa-inspect; https://strale.dev)",
      Accept: "image/*",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!resp.ok) {
    throw new Error(`Could not fetch media: HTTP ${resp.status} from ${parsedUrl.hostname}.`);
  }

  const contentTypeRaw = resp.headers.get("content-type") ?? "";
  const mimeType = contentTypeRaw.split(";")[0]!.trim().toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `Unsupported media type '${mimeType || "(unknown)"}'. Supported: ${Array.from(SUPPORTED_MIME_TYPES).join(", ")}.`
    );
  }

  const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BYTES) {
    throw new Error(`Media too large: ${contentLength} bytes exceeds ${MAX_BYTES} byte limit.`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Media too large: ${buffer.length} bytes exceeds ${MAX_BYTES} byte limit.`);
  }

  const c2pa = await getC2pa();
  const result = (await c2pa.read({ buffer, mimeType })) as ManifestStoreLike | null;

  const now = new Date().toISOString();

  // Case 1: no C2PA manifest in the file
  if (!result || !result.manifests || Object.keys(result.manifests).length === 0) {
    return {
      output: {
        source_url: url,
        media_type: mimeType,
        bytes_size: buffer.length,
        has_c2pa: false,
        manifest_count: 0,
        active_manifest: null,
        validation_status: [],
      },
      provenance: { source: "c2pa-rs (Adobe Content Authenticity Initiative)", fetched_at: now },
    };
  }

  // Case 2: manifest present
  const manifestCount = Object.keys(result.manifests).length;
  const activeLabel = result.active_manifest ?? Object.keys(result.manifests)[0]!;
  const activeManifest = result.manifests[activeLabel];

  const assertions = activeManifest?.assertions ?? [];
  const validationStatus = result.validation_status ?? [];

  return {
    output: {
      source_url: url,
      media_type: mimeType,
      bytes_size: buffer.length,
      has_c2pa: true,
      manifest_count: manifestCount,
      active_manifest: activeManifest
        ? {
            label: activeLabel,
            claim_generator: activeManifest.claim_generator ?? null,
            title: activeManifest.title ?? null,
            vendor: activeManifest.vendor ?? null,
            format: activeManifest.format ?? null,
            signer: activeManifest.signature_info
              ? {
                  issuer: activeManifest.signature_info.issuer ?? null,
                  time: activeManifest.signature_info.time ?? null,
                }
              : null,
            signature_valid: isSignatureValid(validationStatus),
            assertions: assertions.map((a) => ({ label: a.label, kind: a.kind ?? null })),
            assertions_count: assertions.length,
            ingredients_count: activeManifest.ingredients?.length ?? 0,
            ai_generated: isAiGenerated(assertions),
          }
        : null,
      validation_status: validationStatus.map((s) => ({
        code: s.code,
        explanation: s.explanation ?? null,
      })),
    },
    provenance: { source: "c2pa-rs (Adobe Content Authenticity Initiative)", fetched_at: now },
  };
});
