/**
 * HyDE (Hypothetical Document Embeddings) for the Ask Logbook AI RAG path.
 *
 * Instead of embedding the user's raw question, we first ask a small, fast LLM
 * to write the *hypothetical FAA logbook entry* that would answer it, then
 * embed THAT. A real logbook entry lives much closer in embedding space to the
 * real logbook chunks than a natural-language question does, so vector recall
 * improves materially on maintenance-history queries.
 *
 * This is strictly best-effort: `generateHypotheticalDocument` NEVER throws.
 * On any failure (missing OPENAI_API_KEY, network error, bad response) it
 * silently returns the original question unchanged, so the caller falls back
 * to embedding the real query — exactly the pre-HyDE behavior.
 */
import OpenAI from 'openai'

/** Module-level memo — keyed by trimmed+lowercased question. */
const hypotheticalCache = new Map<string, string>()

/**
 * Generate a hypothetical FAA logbook entry that would answer `question`.
 * Returns the generated text on success, or the original `question` unchanged
 * on any failure. Never throws.
 *
 * `persona` is part of the public contract for future persona-tuned prompts;
 * it is intentionally accepted but not yet branched on.
 */
export async function generateHypotheticalDocument(
  question: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  persona: 'owner' | 'mechanic' | 'admin',
): Promise<string> {
  const cacheKey = question.trim().toLowerCase()
  const cached = hypotheticalCache.get(cacheKey)
  if (cached !== undefined) return cached

  if (!process.env.OPENAI_API_KEY) {
    return question
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000,
      maxRetries: 1,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are an FAA aircraft logbook entry. Write the exact logbook ' +
            'entry, maintenance record, or inspection note that would directly ' +
            'answer the question the user provides. Rules: use authentic FAA ' +
            'logbook language and abbreviations; include realistic placeholders ' +
            '([DATE], [N-NUMBER], [CERT#], [HRS]); include relevant FAR ' +
            'references if applicable (e.g. 91.409, 43.9); 2-4 sentences max, ' +
            'logbook style not prose; if the question is about a count or ' +
            'history, write one representative entry from that history.',
        },
        {
          role: 'user',
          content: question,
        },
      ],
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) {
      return question
    }

    hypotheticalCache.set(cacheKey, text)
    return text
  } catch (err) {
    // Silent fallback — HyDE is a best-effort accuracy boost, never a hard
    // dependency. The caller embeds the real question instead.
    console.warn('[rag/hyde] generateHypotheticalDocument failed (ignored):', err)
    return question
  }
}
