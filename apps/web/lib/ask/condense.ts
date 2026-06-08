/**
 * Follow-up condensation for the Ask AI agent.
 *
 * A multi-turn conversation produces context-dependent follow-ups
 * ("who signed it?", "what about the prop?", "and the next one?"). The RAG
 * engine retrieves on the query STRING alone — it has no thread memory — so a
 * bare follow-up retrieves whatever matches its few words, frequently landing
 * on an unrelated document. This rewrites the follow-up into a self-contained
 * question using the prior turns, so retrieval stays anchored on the subject.
 *
 * Best-effort: on any failure (or for the first turn / an already-standalone
 * question) it returns the original question unchanged.
 *
 * Migrated to the unified AI SDK layer (lib/ai/llm): no longer takes an OpenAI
 * client — it calls `generateLlmText` directly.
 */
import { generateLlmText } from '@/lib/ai/llm'

const CONDENSE_SYSTEM = `You rewrite a follow-up message in a conversation into a STANDALONE search query for an aircraft maintenance-records assistant.

Rules:
- Use the conversation so far to resolve references ("it", "that one", "the same aircraft", "what about the prop?", "the next entry") into an explicit, self-contained question.
- PRESERVE all specifics verbatim: tail numbers (N-numbers), dates, AD/SB numbers, part numbers, component and inspection names.
- If the message is already self-contained, return it UNCHANGED.
- If the message is a greeting, thanks, or small talk (not an information request), return it UNCHANGED.
- Output ONLY the rewritten question text — no preamble, no quotes, no explanation.`

export async function condenseFollowUp(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
): Promise<string> {
  const trimmed = question.trim()
  if (!trimmed || !history || history.length === 0) return question

  try {
    const transcript = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 1000)}`)
      .join('\n')

    const { text } = await generateLlmText({
      model: process.env.OPENAI_CONDENSE_MODEL || 'gpt-4o-mini',
      temperature: 0,
      maxOutputTokens: 200,
      system: CONDENSE_SYSTEM,
      prompt: `Conversation so far:\n${transcript}\n\nFollow-up message: ${trimmed}\n\nStandalone question:`,
    })

    const out = text?.trim()
    if (!out) return question
    // Guard against a runaway rewrite — fall back to the user's words.
    return out.length <= 1000 ? out : question
  } catch (err) {
    console.warn('[ask.condense] failed — using raw question:', (err as Error).message)
    return question
  }
}
