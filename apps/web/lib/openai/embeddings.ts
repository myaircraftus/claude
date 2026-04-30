import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Detect rate-limit / transient errors from the OpenAI SDK and decide
// whether to retry. 429 (quota / rate limit) and 5xx are transient;
// retrying with backoff almost always succeeds. 4xx (other than 429) are
// permanent (bad request / auth) and should fail fast.
function getOpenAIErrorRetryDelay(err: unknown, attempt: number): number | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { status?: number; code?: string; message?: string; headers?: Record<string, string> }
  const status = e.status ?? 0
  const message = (e.message ?? '').toLowerCase()
  const isRateLimit =
    status === 429 ||
    /rate[- ]?limit/.test(message) ||
    /quota/.test(message)
  const isTransient = status >= 500 || isRateLimit
  if (!isTransient) return null

  // Honor Retry-After if OpenAI sent one (in seconds).
  const retryAfter = Number(e.headers?.['retry-after'])
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5 * 60 * 1000) // cap at 5 minutes
  }

  // Exponential backoff: 5s, 15s, 45s, 90s, 180s — caps at 5 minutes.
  // Quota-exhausted errors typically reset within a minute or two, so
  // these timings cover the realistic recovery window.
  const base = 5_000
  const jitter = Math.random() * 1000
  const delay = Math.min(base * Math.pow(3, attempt - 1), 5 * 60 * 1000) + jitter
  return Math.round(delay)
}

/**
 * Generate embeddings for an array of text chunks using OpenAI.
 * Processes in batches of 100 with a 200ms pause between batches.
 *
 * Built-in resilience: each batch retries up to 6 times on rate-limit
 * (HTTP 429) or transient 5xx with exponential backoff. By the time the
 * last attempt fires we've waited 5+15+45+90+180 = 335 seconds, which is
 * plenty for OpenAI's per-minute quota window to refresh. If all retries
 * fail, the final error bubbles up — but in practice the user almost
 * never hits this since the retry chain rides through any transient
 * blip without intervention.
 */
export async function generateEmbeddings(
  chunks: Array<{ id: string; text: string }>
): Promise<Array<{ id: string; embedding: number[] }>> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';
  const BATCH_SIZE = 100;
  const MAX_ATTEMPTS = 6;
  const results: Array<{ id: string; embedding: number[] }> = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    let lastErr: unknown = null;
    let response: Awaited<ReturnType<ReturnType<typeof getOpenAI>['embeddings']['create']>> | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        response = await getOpenAI().embeddings.create({
          model,
          input: texts,
          dimensions: 1536,
        });
        break;
      } catch (err) {
        lastErr = err;
        const delay = getOpenAIErrorRetryDelay(err, attempt);
        if (delay == null || attempt === MAX_ATTEMPTS) {
          // Permanent error or out of retries — give up.
          throw err;
        }
        const status = (err as { status?: number })?.status;
        console.warn(
          `[embeddings] batch ${i}-${i + batch.length} attempt ${attempt}/${MAX_ATTEMPTS} ` +
            `transient error (status=${status ?? 'n/a'}), retrying in ${Math.round(delay / 1000)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!response) {
      throw lastErr ?? new Error('OpenAI embeddings call failed without an error');
    }

    for (let j = 0; j < batch.length; j++) {
      results.push({
        id: batch[j].id,
        embedding: response.data[j].embedding,
      });
    }

    // 200ms pause between batches to respect rate limits
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
