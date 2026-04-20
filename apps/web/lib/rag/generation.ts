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

  // 4. Call GPT-4o with json_object response_format, temperature 0.1
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.1,
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

  // 6. Build AnswerCitation objects from cited_chunk_ids
  const citationMap = new Map<string, RetrievedChunk>(
    chunks.map((c) => [c.chunk_id, c])
  );

  const citations: AnswerCitation[] = citedChunkIds
    .filter((id) => citationMap.has(id))
    .map((id) => buildAnswerCitationFromChunk(citationMap.get(id)!));

  // 7. Return complete AnswerResult
  return {
    answer: parsed.answer ?? '',
    confidence: parsed.confidence ?? 'low',
    confidenceScore: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0,
    citations,
    citedChunkIds,
    warningFlags,
    followUpQuestions,
    tokensPrompt,
    tokensCompletion,
  };
}
