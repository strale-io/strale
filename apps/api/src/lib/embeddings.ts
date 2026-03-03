// Direct HTTP calls to Voyage AI REST API (SDK has broken ESM exports)

const MODEL = "voyage-3.5-lite";
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, init);
    if (response.status === 429 && attempt < retries - 1) {
      // Rate limited — wait and retry with exponential backoff
      const wait = Math.min(2000 * Math.pow(2, attempt), 30000);
      console.warn(
        `[voyage] Rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return response;
  }
  return fetch(url, init); // Last attempt, no retry
}

/**
 * Embed a single query string. Uses input_type "query" for retrieval-optimized vectors.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey)
    throw new Error("VOYAGE_API_KEY is required for semantic search");

  const response = await fetchWithRetry(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: MODEL,
      input_type: "query",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Voyage API error: ${response.status} ${await response.text()}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

/**
 * Embed multiple document strings in a single batch call.
 * Uses input_type "document" for catalog items.
 * Voyage supports up to 128 inputs per batch.
 */
export async function embedDocuments(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey)
    throw new Error("VOYAGE_API_KEY is required for semantic search");

  const BATCH_SIZE = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    // Pause between batches to respect rate limits (3 RPM on free tier)
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 21000));
    }

    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await fetchWithRetry(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: batch,
        model: MODEL,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Voyage API error: ${response.status} ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    for (const item of data.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

/**
 * Cosine similarity between two vectors.
 * Voyage embeddings are normalized, so cosine similarity = dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
