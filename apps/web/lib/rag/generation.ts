import OpenAI from 'openai';
import type { RetrievedChunk, AnswerCitation, AnswerResult, QueryConfidence } from '@/types';
import { buildAnswerCitationFromChunk } from '@/lib/rag/citation-anchors'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert aviation technical assistant for myaircraft.us, a document management and Q&A platform for aircraft owners, mechanics, and operators. You answer questions by synthesizing information retrieved from the user's actual aircraft documents — logbooks, pilot operating handbooks, maintenance manuals, service bulletins, airworthiness directives, and more.

CRITICAL RULES:
1. ONLY answer based on the provided document chunks. Do NOT use general aviation knowledge, training data, or assumptions that are not directly supported by the provided text. If the documents do not contain sufficient information to answer the question, say so clearly.
2. ALWAYS cite your sources using the citation index numbers provided (e.g., [1], [2], [1][3]). Every factual claim must have at least one citation. Citations must appear inline, immediately after the relevant statement.
3. NEVER fabricate, extrapolate, or speculate about technical data such as limits, procedures, part numbers, torque values, fuel quantities, speeds, or maintenance intervals. If a value is not explicitly stated in the documents, do not provide it.
4. If the evidence is ambiguous or conflicting between documents, explicitly call this out in your answer and flag it as a warning.
5. For safety-critical questions (airworthiness directives, emergency procedures, operating limits), always recommend the user verify with the actual current document and a qualified aviation professional. Flag these with a "safety_critical" warning.
6. Maintain a professional, precise tone appropriate for aviation technical documentation. Avoid hedging language that could create ambiguity in a safety context.
7. Your JSON response must strictly follow the schema provided. Do not include any text outside the JSON object.
8. INSPECTION TYPES ARE NOT INTERCHANGEABLE. The Annual Inspection (FAR 91.409 / Part 43 Appendix D) is a distinct legal & technical event from a 100-hour inspection, ELT inspection, pitot-static / altimeter / transponder check, oil change, or any other periodic check. NEVER substitute one inspection type for another in your answer. If the user asks about a specific inspection type (e.g. "last annual") and the documents do not clearly state that type, say so explicitly — for example: "I don't see an annual inspection record. The most recent maintenance entry I can find is a 100-hour inspection on YYYY-MM-DD." Do NOT answer a question about an annual with a 100-hour, and do NOT answer a 100-hour question with an annual. The phrasing "I certify this aircraft has been inspected in accordance with an Annual Inspection and found airworthy" is the legally distinct annual signoff — only this (or equivalent FAR 91.409 / Appendix D wording) counts as an annual inspection.
9. When the user asks for "last X" / "most recent X" / "latest X", scan ALL the provided chunks for entries matching X, identify the one with the most recent date (Tach/Hobbs/calendar date), and lead with that one. If multiple chunks contain X with no clear date ordering, say so.

RESPONSE FORMAT (strict JSON):
{
  "answer": "Your detailed answer with inline citations [1][2]...",
  "confidence": "high" | "medium" | "low" | "insufficient_evidence",
  "confidence_score": 0.0-1.0,
  "cited_chunk_ids": ["chunk-uuid-1", "chunk-uuid-2"],
  "warning_flags": ["safety_critical" | "conflicting_sources" | "document_may_be_outdated" | "partial_information"],
  "follow_up_questions": ["Up to 3 relevant follow-up questions the user might want to ask"]
}`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LLMResponse {
  answer: string;
  confidence: QueryConfidence;
  confidence_score: number;
  cited_chunk_ids: string[];
  warning_flags: string[];
  follow_up_questions: string[];
}

// ─── Generate Answer ───────────────────────────────────────────────────────────

/**
 * Generate a grounded answer from retrieved document chunks using GPT-4o.
 * Returns insufficient_evidence if no chunks are provided.
 */
export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AnswerResult & { tokensPrompt: number; tokensCompletion: number }> {
  // 1. Return insufficient_evidence response if no chunks
  if (chunks.length === 0) {
    return {
      answer:
        "I was unable to find relevant information in your uploaded documents to answer this question. Please ensure the relevant documents (such as your POH, maintenance manual, or logbook) have been uploaded and fully processed.",
      confidence: 'insufficient_evidence',
      confidenceScore: 0,
      citations: [],
      citedChunkIds: [],
      warningFlags: ['partial_information'],
      followUpQuestions: [],
      tokensPrompt: 0,
      tokensCompletion: 0,
    };
  }

  // 2. Build numbered citation context block
  const contextLines: string[] = ['DOCUMENT EXCERPTS:'];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const header = [
      `[${i + 1}] Document: "${chunk.document_title}"`,
      `Type: ${chunk.doc_type}`,
      chunk.aircraft_tail ? `Aircraft: ${chunk.aircraft_tail}` : null,
      chunk.section_title ? `Section: ${chunk.section_title}` : null,
      `Page: ${chunk.page_number}${chunk.page_number_end ? `–${chunk.page_number_end}` : ''}`,
      `Chunk ID: ${chunk.chunk_id}`,
    ]
      .filter(Boolean)
      .join(' | ');

    contextLines.push(`\n${header}\n${chunk.chunk_text}`);
  }
  const contextBlock = contextLines.join('\n');

  // 3. Build message array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Include prior conversation turns for context
  if (conversationHistory && conversationHistory.length > 0) {
    for (const turn of conversationHistory) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  messages.push({
    role: 'user',
    content: `${contextBlock}\n\nQUESTION: ${question}`,
  });

  // 4. Call GPT-4o with json_object response_format, temperature 0 for
  //    deterministic answers. Was 0.1 — small but enough to flip token
  //    choice across runs, so the same chunks could produce visibly
  //    different phrasing / citation indices on each refresh. With temp 0
  //    a stable retrieval set produces a stable answer.
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2048,
  });

  const rawContent = completion.choices[0]?.message?.content ?? '{}';
  const tokensPrompt = completion.usage?.prompt_tokens ?? 0;
  const tokensCompletion = completion.usage?.completion_tokens ?? 0;

  // 5. Parse JSON response
  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(rawContent) as LLMResponse;
  } catch {
    throw new Error(`Failed to parse LLM JSON response: ${rawContent}`);
  }

  // Normalise warning_flags and follow_up_questions to arrays
  const warningFlags: string[] = Array.isArray(parsed.warning_flags)
    ? parsed.warning_flags
    : [];
  const followUpQuestions: string[] = Array.isArray(parsed.follow_up_questions)
    ? parsed.follow_up_questions.slice(0, 3)
    : [];
  const citedChunkIds: string[] = Array.isArray(parsed.cited_chunk_ids)
    ? parsed.cited_chunk_ids
    : [];

  // 6. Build AnswerCitation objects.
  //
  // CRITICAL for citation correctness: the context block presents chunks to
  // the model numbered [1]..[N] (chunks[i] is labelled [i+1]). The user sees
  // those same [N] markers inline in the rendered answer, and the UI resolves
  // marker [N] to citations[N-1]. Therefore the ONLY ordering that keeps a
  // displayed [N] pointing at the chunk the model actually quoted is the
  // inline-marker order.
  //
  // The model is also asked to return UUIDs in cited_chunk_ids, but it
  // controls that list's order/contents independently of the inline markers
  // — so trusting cited_chunk_ids order would silently mis-map [N] to the
  // wrong page/document. We therefore make the inline [N] markers the source
  // of truth for citation ordering, and only fall back to UUIDs when the
  // answer contains no usable markers at all.
  const citationMap = new Map<string, RetrievedChunk>(
    chunks.map((c) => [c.chunk_id, c])
  );

  const answerText = typeof parsed.answer === 'string' ? parsed.answer : '';
  const positionalIndices = Array.from(
    new Set(
      Array.from(answerText.matchAll(/\[(\d+)\]/g))
        .map((m) => parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= chunks.length)
    )
  ).sort((a, b) => a - b);

  const uuidCitations = citedChunkIds
    .filter((id) => citationMap.has(id))
    .map((id) => citationMap.get(id)!);

  // Inline markers win: citations[N-1] must be the chunk labelled [N] in the
  // context the model was shown. Only when there are zero inline markers do
  // we fall back to the model's UUID list.
  const orderedChunks: RetrievedChunk[] =
    positionalIndices.length > 0
      ? positionalIndices.map((n) => chunks[n - 1])
      : uuidCitations;

  const citations: AnswerCitation[] = orderedChunks.map((chunk) =>
    buildAnswerCitationFromChunk(chunk)
  );

  // 7. Confidence honesty guardrails.
  //
  // The model self-reports confidence; nothing forces it to be honest. Two
  // floors we enforce here so a confident-sounding answer can never ship
  // without supporting evidence:
  //  (a) confidence_score must be a finite number in [0,1]; anything else
  //      is treated as 0 (it cannot be trusted).
  //  (b) if we resolved zero citations, the answer is ungrounded — it cannot
  //      legitimately be 'high'/'medium'. Cap it at 'low' and pull the score
  //      down. This only ever lowers confidence, never raises it.
  const rawScore = parsed.confidence_score;
  let confidenceScore =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? Math.min(1, Math.max(0, rawScore))
      : 0;

  let confidence: QueryConfidence = parsed.confidence ?? 'low';

  if (citations.length === 0) {
    if (confidence === 'high' || confidence === 'medium') {
      confidence = 'low';
    }
    confidenceScore = Math.min(confidenceScore, 0.3);
  }

  // 8. Return complete AnswerResult
  return {
    answer: parsed.answer ?? '',
    confidence,
    confidenceScore,
    citations,
    citedChunkIds,
    warningFlags,
    followUpQuestions,
    tokensPrompt,
    tokensCompletion,
  };
}
