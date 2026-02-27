import { registerCapability, type CapabilityInput } from "./index.js";

// ─── LinkedIn URL validation — algorithmic format check + HTTP accessibility ──

interface LinkedInUrlInfo {
  url: string;
  valid_format: boolean;
  url_type: "profile" | "company" | "job" | "post" | "school" | "unknown";
  slug: string | null;
  accessible: boolean | null;
  normalized_url: string | null;
  status_code: number | null;
  error?: string;
}

// LinkedIn URL patterns
const PATTERNS: Array<{
  type: LinkedInUrlInfo["url_type"];
  regex: RegExp;
  slugGroup: number;
}> = [
  {
    type: "profile",
    regex: /^https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)\/?$/,
    slugGroup: 1,
  },
  {
    type: "company",
    regex: /^https?:\/\/(?:www\.)?linkedin\.com\/company\/([a-zA-Z0-9\-_%]+)\/?$/,
    slugGroup: 1,
  },
  {
    type: "job",
    regex: /^https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/([a-zA-Z0-9\-_%]+)\/?$/,
    slugGroup: 1,
  },
  {
    type: "post",
    regex: /^https?:\/\/(?:www\.)?linkedin\.com\/posts\/([a-zA-Z0-9\-_%]+)\/?$/,
    slugGroup: 1,
  },
  {
    type: "school",
    regex: /^https?:\/\/(?:www\.)?linkedin\.com\/school\/([a-zA-Z0-9\-_%]+)\/?$/,
    slugGroup: 1,
  },
];

function parseLinkedInUrl(url: string): {
  valid: boolean;
  type: LinkedInUrlInfo["url_type"];
  slug: string | null;
  normalized: string | null;
} {
  const trimmed = url.trim();

  for (const { type, regex, slugGroup } of PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      const slug = match[slugGroup];
      // Normalize: ensure https, www prefix, trailing slash
      const normalized = `https://www.linkedin.com/${type === "profile" ? "in" : type === "job" ? "jobs/view" : type === "post" ? "posts" : type}/${slug}/`;
      return { valid: true, type, slug, normalized };
    }
  }

  // Check if it's at least a linkedin.com URL but doesn't match known patterns
  const isLinkedinDomain = /^https?:\/\/(?:www\.)?linkedin\.com\//i.test(trimmed);
  if (isLinkedinDomain) {
    return { valid: false, type: "unknown", slug: null, normalized: null };
  }

  return { valid: false, type: "unknown", slug: null, normalized: null };
}

async function checkAccessibility(
  url: string,
): Promise<{ accessible: boolean; statusCode: number | null }> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    // LinkedIn often returns 999 for bot detection
    return {
      accessible: response.status === 200,
      statusCode: response.status,
    };
  } catch {
    // Try GET as fallback (some servers don't support HEAD well)
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      return {
        accessible: response.status === 200,
        statusCode: response.status,
      };
    } catch {
      return { accessible: false, statusCode: null };
    }
  }
}

registerCapability("linkedin-url-validate", async (input: CapabilityInput) => {
  const rawUrl = (input.url as string) ?? (input.task as string) ?? "";
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error(
      "'url' is required. Provide a LinkedIn URL to validate (e.g. 'https://linkedin.com/in/john-doe').",
    );
  }

  // Try to extract a LinkedIn URL from the input text
  let url = rawUrl.trim();
  const linkedinMatch = url.match(
    /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/i,
  );
  if (linkedinMatch) {
    url = linkedinMatch[0];
  }

  const parsed = parseLinkedInUrl(url);

  // Only check accessibility if format is valid
  let accessible: boolean | null = null;
  let statusCode: number | null = null;

  if (parsed.valid && parsed.normalized) {
    const check = await checkAccessibility(parsed.normalized);
    accessible = check.accessible;
    statusCode = check.statusCode;
  }

  const result: Record<string, unknown> = {
    url,
    valid_format: parsed.valid,
    url_type: parsed.type,
    slug: parsed.slug,
    accessible,
    normalized_url: parsed.normalized,
    status_code: statusCode,
  };

  if (!parsed.valid) {
    result.error =
      "URL does not match a recognized LinkedIn URL pattern. Expected formats: /in/{slug}, /company/{slug}, /jobs/view/{id}, /posts/{slug}";
  }

  return {
    output: result,
    provenance: {
      source: "linkedin.com",
      fetched_at: new Date().toISOString(),
    },
  };
});
