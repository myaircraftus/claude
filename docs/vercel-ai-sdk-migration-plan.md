# Migration Plan: Route all LLM calls through the Vercel AI SDK

**Status:** Proposal for review — *no code changed yet.*
**Author:** Claude (investigation + plan)
**Date:** 2026-06-03 · *Reconciled 2026-06-04 against the now-merged Ask streaming work (commits `b1c5573d` token streaming + `581d7bce` citation renumber). Net effect on the plan: streaming was already in scope; §5 / Phase 7 / Assumption A3 sharpened to mark it **already shipped — must be preserved**, with the verified event contract + client coupling documented.*
**Scope:** `apps/web` (Next.js app), `trigger/` (trigger.dev jobs), `apps/web/scripts/**`. `apps/mobile` is **out of scope** (makes no direct LLM calls — see §2.5).

---

## 0. TL;DR

Today every LLM call is made by talking to a provider **directly**: the raw `openai` npm SDK (`new OpenAI()` scattered across ~50 files), a hand-rolled `fetch()` wrapper for Anthropic (`lib/ai/anthropic.ts`), a raw `fetch()` to Google for Gemini OCR, and a raw `fetch()` to Cohere for reranking. There is **no central client**, and cost/observability logging (`ai_activity_log`) is applied **consistently only on the Anthropic path** — most OpenAI calls are unlogged.

The goal is to make **one unified library — the Vercel AI SDK (`ai` v6 + `@ai-sdk/*` provider packages)** — the single way we talk to any model, so future features (provider fallback, streaming everywhere, structured output with Zod, tool calling, the AI Gateway, telemetry) are available across the whole product.

**Recommended approach:** *wrapper-first, then mechanical migration, riskiest file last.*

1. Add the SDK + a small **central `lib/ai/llm` layer** that mirrors the ergonomics of the existing `callAnthropic()` (pass a Supabase client + a log scope, get back text/object + token usage, always logged). This is the keystone — it fixes the logging inconsistency and gives ~60 files one thing to call.
2. Migrate **embeddings** (one helper, big coverage), then the **structured-JSON callers** (the largest bucket — a near-mechanical `JSON.parse` → `generateObject`+Zod swap), then swap the **Anthropic wrapper's internals**, then **vision**, then **transcription**, and finally the **`/api/ask` streaming + tool-calling route** (the single riskiest file).
3. Keep model IDs, env-var overrides, and the NDJSON streaming wire-protocol **unchanged** so the diff stays reviewable and behavior stays stable. (Model upgrades and a `useChat` client rewrite are explicitly deferred — see §7.)

**Rough size:** ~68 call sites across ~60 files, but most are 5–15-line mechanical swaps once the wrapper exists. The genuine effort concentrates in **4 places**: the new wrapper, `lib/ingestion/native-pdf.ts`, `app/api/ask/route.ts`, and the embeddings helper. Estimated **8 phases**, each independently shippable.

> ⚠️ **Confidence note (per your preference for flagged uncertainty):** the inventory below is high-confidence (built from a full code sweep). The AI SDK *version* (v6) and core API names are confirmed from current docs/release notes, but a few exact v5→v6 symbol names (e.g. `maxOutputTokens`, `stopWhen`/`stepCountIs`, `usage.inputTokens`) should be re-verified against the installed package's TypeScript types on the day we run `pnpm add` — the docs site is JS-rendered and a couple of these I could only confirm from release notes, not a live code sample. I've flagged each such spot inline with 🔎.

---

## 1. Why the Vercel AI SDK, and which version

- **Package:** `ai` (the core). Latest is **v6.x** (v6.0.x as of June 2026). AI SDK **5** (July 2025) was the big architectural rewrite — SSE-native streaming, the `UIMessage`/`ModelMessage` split, tools defined with `inputSchema`/`outputSchema`, renamed token-limit and usage fields. **v6** is *additive over v5* and can be adopted incrementally, so targeting **`ai@^6`** gets us the latest without extra migration cost beyond the v5 API shapes.
- **Provider packages we need:**
  - `@ai-sdk/openai` — chat (`gpt-4o`/`gpt-4o-mini`), embeddings (`text-embedding-3-large`), vision, Whisper transcription.
  - `@ai-sdk/anthropic` — Claude (`claude-sonnet-4-5`, `claude-opus-4-5`, `claude-3-5-haiku-latest`).
  - `@ai-sdk/google` — Gemini (`gemini-3-flash-preview`) for OCR.
  - `@ai-sdk/react` — **only if** we later migrate the Ask client to `useChat` (deferred; see §7).
- **Already present:** `zod@^3.23` is a dependency of `apps/web` — the SDK's `generateObject`/tool schemas use Zod, so no new schema lib is needed.
- **Env vars are reused as-is:** the providers auto-read `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY`. ⚠️ Today Gemini reads `GEMINI_API_KEY` — we either rename the env var or construct the Google provider with `createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })`. Recommend the latter (no infra change).

**Sources:** [AI SDK docs](https://ai-sdk.dev/docs/introduction) · [`ai` on npm](https://www.npmjs.com/package/ai) · [AI SDK 5 announcement](https://vercel.com/blog/ai-sdk-5) · [vercel/ai releases](https://github.com/vercel/ai/releases) · [Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

---

## 2. Current-state inventory

### 2.1 The big picture

| Dimension | Finding |
|---|---|
| Providers in use | **OpenAI** (bulk), **Anthropic** (via raw `fetch` wrapper), **Google Gemini** (raw `fetch`, OCR), **Cohere** (raw `fetch`, reranking) |
| Central client? | **No.** `new OpenAI()` is instantiated ad-hoc in ~25 files. Anthropic has a partial wrapper (`lib/ai/anthropic.ts`); vision has a partial wrapper (`lib/ai/openai-vision.ts`); embeddings have a helper (`lib/openai/embeddings.ts`). |
| Cost/usage logging | `ai_activity_log` table (input/output tokens, cost cents, duration, status). **Always written on the Anthropic path** (`callAnthropic`) and the vision helper (`logVisionActivity`). **Mostly absent on direct-OpenAI calls.** `agent_runs` separately logs agent token usage via the runner. |
| Structured output | Dominant pattern: OpenAI `response_format: { type: 'json_object' }` + manual `JSON.parse`. No schema validation today. |
| Streaming | Exactly **one** streaming surface: `/api/ask` (hand-rolled NDJSON over a `ReadableStream`, with a 3-round tool-calling loop). Everything else is blocking request/response. |
| Retry/backoff | Hand-rolled exponential backoff in `lib/openai/embeddings.ts` and `lib/ai/anthropic.ts`. The SDK has built-in `maxRetries`. |

### 2.2 Provider × operation matrix (approximate counts)

| Operation | OpenAI | Anthropic | Gemini | Cohere |
|---|---|---|---|---|
| Chat — structured JSON (`json_object` + parse) | ~30 sites | (via text + parse) | — | — |
| Chat — plain text | ~9 sites | a few | — | — |
| Chat — **tool calling + streaming** | **1** (`/api/ask`, streaming **already shipped**) | — | — | — |
| Embeddings | 1 helper + ~6 standalone | — | — | — |
| Vision / multimodal (image/PDF) | ~8 sites | 2 routes (scan-part, scan-logbook) | 1 (native-pdf OCR) | — |
| Audio transcription (Whisper) | 3 sites | — | — | — |
| Reranking | — | — | — | 1 (`rag-rerank-cache-warmer`) |

### 2.3 Key shared modules (the choke points)

| Module | Role | Migration leverage |
|---|---|---|
| `lib/ai/anthropic.ts` | `callAnthropic(supabase, args, log)` → raw `fetch`, retries, **always logs `ai_activity_log`**. Used by ~8 callers. | **High** — rewrite internals to `@ai-sdk/anthropic`, keep signature → all callers unchanged. |
| `lib/openai/embeddings.ts` | `generateEmbeddings(chunks)` → batched OpenAI embeddings, custom retry. | **High** — one swap to `embedMany` covers router-classifier, ingestion, intelligence-query, several scripts. |
| `lib/ai/openai-vision.ts` | `callOpenAiVision(args)` + `logVisionActivity()`. | Medium — one wrapper, but file-handling changes (parts vs `image_url`). |
| `lib/agents/runner.ts` | `runAgent(id, ctx, fn)` — wraps audit logging (`agent_runs`) around an arbitrary `fn`. **Does NOT make the model call** — each agent calls the model itself and reports tokens via `logger.recordTokens/recordModel`. | Medium — the runner stays; agents' inner calls migrate to the new wrapper, which feeds `logger`. |
| `lib/ai/tools.ts` (`AI_TOOLS`) | OpenAI `ChatCompletionTool[]` definitions for the Ask route. | Must be re-expressed as AI SDK `tool()` + Zod `inputSchema` (§5, §6 Phase 7). |

### 2.4 Per-cluster inventory (condensed — full tables in Appendix A)

- **Agents framework (`lib/agents/`):** 14 of ~51 agents call a model. 10 use inline `new OpenAI()` (JSON output), 3 use raw `fetch()` to OpenAI (`rag-query-rewriter`, `rag-answer-grader`, `support-bug-triage`), **1 uses Cohere rerank** (`rag-rerank-cache-warmer`). All record tokens through the runner logger; all have a no-API-key fallback. ~37 agents are pure heuristics/SQL/regex — **no migration needed**.
- **API routes (`app/api/`):** ~16 routes call a model. 13 OpenAI (incl. 2 Whisper), 3 Anthropic (via `callAnthropic`). **`/api/ask` is the only streaming + tool-calling route.** Most OpenAI routes do **not** write `ai_activity_log`.
- **Core libs (`lib/`):** ~24 files. RAG (`generation`, `contextual`, `hyde`, `aggregation`), ask (`condense`, `question-classifier`), ingestion (`native-pdf` — *multiple* call sites incl. Gemini; `server`), ocr (`direct-chunking`), extractors/predictors/inspectors/analyzers under `lib/ai/`, plus `parts/ai-resolve`, `economics/operating-cost-ai`, `documents/auto-classify`, `aircraft/intelligence-ai`, `support/ai-triage`, `intelligence/reports/*`.
- **Scripts (`apps/web/scripts/`):** ~13 offline scripts (`.ts` + `.mjs`). Some import the app's `generateEmbeddings`/`hyde` helpers (migrate for free); the `.mjs` ones and `trace-ask.ts`/`finish-stuck-ingestions.ts` roll their own client.
- **Trigger (`trigger/`):** `jobs/ingest-document.ts` rolls its **own** `new OpenAI()` for embeddings (duplicates the app helper). `trigger/` has its own `package.json` + `openai` dependency.

### 2.5 Out of scope

- **`apps/mobile`** — confirmed it makes **no** direct LLM/embeddings calls; it only calls the web backend (`/api/query`, `/api/upload`). Nothing to migrate.
- **`lib/vision/workers/*`** (modal/runpod/replicate/colab) — GPU compute dispatch for the vision pipeline, **not** LLM text/multimodal API calls. Leave as-is. (`lib/vision/openai-fallback.ts` *is* an OpenAI vision call and *is* in scope.)
- **Cohere reranking** (`rag-rerank-cache-warmer`) — AI SDK core has no first-class rerank primitive. Recommend leaving as raw `fetch` for now (or a community provider later). Flagged so it isn't mistaken for "missed."

---

## 3. Target architecture — the central `lib/ai/llm` layer

The single most valuable change is a thin, provider-agnostic wrapper that **preserves the `callAnthropic` ergonomics we already trust** (Supabase client + a log scope in, text/object + token usage out, always logged). Proposed shape:

```
apps/web/lib/ai/llm/
  provider.ts     // model registry: resolve a logical model id → an AI SDK model
  generate.ts     // generateText wrapper  → { text, usage }   + ai_activity_log
  structured.ts   // generateObject wrapper → { object, usage } + ai_activity_log (Zod)
  vision.ts       // multimodal message-part builder (image/PDF) over generate/structured
  embed.ts        // embedMany wrapper (replaces lib/openai/embeddings.ts internals)
  transcribe.ts   // experimental_transcribe wrapper (Whisper)  🔎
  stream.ts       // streamText helper for /api/ask (tools + multi-step)
  pricing.ts      // existing per-model $/1M tables, moved here (single source)
  log.ts          // the ai_activity_log writer (lifted from anthropic.ts)
```

**Provider registry (`provider.ts`)** centralizes model construction and keeps env quirks in one place:

```ts
// Illustrative — verify symbol names against installed @ai-sdk types.
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })

export const models = {
  chat:        (id = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o')      => openai.chat(id),
  chatMini:    (id = 'gpt-4o-mini')                                  => openai.chat(id),
  embedding:   (id = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large') => openai.embedding(id),
  claude:      (id = 'claude-sonnet-4-5')                            => anthropic(id),
  geminiOcr:   (id = process.env.GEMINI_OCR_MODEL ?? 'gemini-3-flash-preview') => google(id),
  whisper:     ()                                                    => openai.transcription('whisper-1'), // 🔎
}
```

**Why this matters:** the `usage` object the SDK returns on *every* call (`{ inputTokens, outputTokens, totalTokens }` 🔎) is exactly what `ai_activity_log` and `agent_runs` need. By funneling through `log.ts`, **every** migrated call gets logged — closing today's gap where direct-OpenAI calls are invisible to cost tracking. The pricing tables already in `anthropic.ts`/`openai-vision.ts` move to `pricing.ts` as the single source.

---

## 4. Pattern → AI SDK mapping (the cheat-sheet for the migration)

| # | Current pattern | AI SDK replacement | Notes / gotchas |
|---|---|---|---|
| 1 | `openai.chat.completions.create({ messages, max_tokens })` → `choices[0].message.content` | `generateText({ model, messages, maxOutputTokens })` → `.text` | 🔎 token-limit param is **`maxOutputTokens`** (renamed from `maxTokens` in v5). |
| 2 | `response_format: { type: 'json_object' }` + `JSON.parse(content)` | `generateObject({ model, schema: z…, messages })` → `.object` | **Biggest win.** Replaces unvalidated parse with a typed, retried Zod object. ~30 sites. |
| 3 | `tools` (OpenAI `ChatCompletionTool[]`) + manual delta accumulation + 3-round loop | `streamText({ model, tools: { name: tool({ inputSchema: z…, execute }) }, stopWhen: stepCountIs(3) })` | 🔎 `stopWhen`/`stepCountIs` replaced v4's `maxSteps`. Only `/api/ask`. |
| 4 | Manual NDJSON `ReadableStream` of `{type:'token'|'meta'|...}` | Keep the protocol; drive it from `result.fullStream` parts (`text-delta`, `tool-call`, `finish`). *Or* adopt `toUIMessageStreamResponse()` + `useChat` (deferred). | Keeping the wire protocol = zero client change. See §7. |
| 5 | `openai.embeddings.create({ input, dimensions: 1536 })` | `embedMany({ model, values, providerOptions: { openai: { dimensions: 1536 } } })` → `.embeddings` | `usage` is `{ tokens }`. SDK `maxRetries`/`maxParallelCalls` can replace hand-rolled batching/backoff. |
| 6 | Vision: `{ type: 'image_url', image_url: { url } }` content blocks; OpenAI Files API uploads | Message parts: `{ type: 'image', image }` and `{ type: 'file', data, mediaType: 'application/pdf' }` | File-handling changes — no more Files API upload step for vision; pass bytes/URL as a part. |
| 7 | `callAnthropic` raw `fetch` to Messages API | `generateText({ model: anthropic('claude-sonnet-4-5'), system, messages })` inside the **same** `callAnthropic` signature | Keep the exported function identical → ~8 callers untouched. |
| 8 | Gemini OCR: raw `fetch` to `generativelanguage.googleapis.com` with `inline_data` | `generateText`/`generateObject({ model: google('gemini-3-flash-preview'), messages: [file part] })` | Replaces the bespoke fetch + base64 plumbing in `native-pdf.ts`. |
| 9 | Whisper: raw `fetch` multipart / `openai.audio.transcriptions.create` | `experimental_transcribe({ model: openai.transcription('whisper-1'), audio })` 🔎 | API is `experimental_*` — acceptable, but flagged. |
| 10 | Cohere rerank: raw `fetch` to `api.cohere.com/v2/rerank` | **No core equivalent** — leave as-is, or community provider later | Out of scope for this migration. |

---

## 5. The two hard files (call out early)

**`app/api/ask/route.ts` (highest risk) — token streaming is ALREADY SHIPPED here; the migration must PRESERVE it, not add it.** ✅ *Verified against current `main` (commit `b1c5573d`).* The route runs a GPT-4o **tool-calling loop (max 3 rounds)** in **two modes**: a blocking JSON mode and an **opt-in streaming mode** (`{ stream: true }`, single-aircraft only). Streaming mode hand-accumulates the OpenAI tool-call deltas and emits a **custom NDJSON event protocol** over a `ReadableStream`:

> `thread_id` → `status` (stages: `thinking` / `searching` / `drafting` / `writing`) → `meta` (citations + confidence + follow-ups, sent *before* tokens so inline `[N]` markers resolve) → `token`\* → `reset` (rare model-"preamble" case) → `done` (authoritative full bundle) | `error`.

The client **`components/ask/ask-experience.tsx` already consumes this exact protocol** (reader/decoder loop → `processEvent`, `STREAM_STATUS_LABELS`, and it replaces the streamed-in content with the `done` bundle on completion). "All Aircraft" (fan-out / org-wide / structured) still returns plain JSON; the client branches on response `Content-Type`. The tools (`search_documents`, `search_logbook`, `search_parts`, `create_logbook_entry`, `generate_checklist`) currently `fetch` *internal* API routes.

**Migration = rebuild the loop on `streamText` + `tool()` with `stopWhen: stepCountIs(3)`, mapping `result.fullStream` parts (`text-delta` / `tool-call` / `finish`) onto the SAME NDJSON events** — so the route's wire output stays byte-compatible and **the client needs no change**. Behaviors that MUST be preserved verbatim: the status-stage sequence; `meta`-before-`token` ordering; the `reset` event; the `done` bundle as source of truth; per-aircraft fan-out staying JSON; thread persistence even on mid-stream client disconnect; and citation-marker handling (renumber-to-compacted from `581d7bce` + the orphan-`[N]` drop in `answer-block.tsx`). This is a careful, well-tested rewrite — schedule it **last**, on its own branch, with the blocking path migrated and JSON-diffed first, then the streaming path diffed **event-for-event** against the current route on a fixed question set.

**`lib/ingestion/native-pdf.ts` (highest effort).** One file with **multiple** call sites: OpenAI `chat.completions`, OpenAI `responses.create` + Files API (vision OCR), and a **raw Gemini `fetch`** path. Treat it as its own sub-project within the vision phase. Note the OpenAI **Responses API** usage — the `@ai-sdk/openai` provider can target it via `openai.responses(id)`, but confirm parity for the structured-OCR calls.

---

## 6. Phased migration plan

Each phase is independently shippable and leaves the app fully working (old and new paths can coexist — the wrapper is additive until a file is cut over).

| Phase | What | Files (approx) | Risk | Why this order |
|---|---|---|---|---|
| **0. Foundation** | `pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google`. Build `lib/ai/llm/*` (provider registry, `generate`/`structured`/`embed`/`vision`/`transcribe` wrappers, move pricing + `ai_activity_log` writer). Unit-test with `MockLanguageModelV2`. **No call sites changed yet.** | new module + deps | Low | Keystone. Everything else depends on it. |
| **1. Embeddings** | Swap `lib/openai/embeddings.ts` internals → `embedMany`. Verify 1536-dim parity. Then de-dupe the standalone clients in `trigger/jobs/ingest-document.ts` + `.mjs` scripts (point them at the shared helper where possible). | 1 helper + ~6 | Low | Centralized; pgvector dim mismatch is the only real risk and is easy to assert. |
| **2. Structured-JSON callers** | Mechanical `json_object`+`JSON.parse` → `generateObject`+Zod across agents, routes, libs (extractors, reports, classifiers, parts/economics/documents). Define Zod schemas matching today's parsed shapes. | ~30 | Low–Med | Largest bucket, most repetitive, biggest correctness win. Do in sub-batches by directory. |
| **3. Plain-text chat** | `generateText` swap for the narrative callers (ai-summary, intelligence-ai, reports, contextual, hyde, condense). | ~9 | Low | Trivial once wrapper exists. |
| **4. Anthropic** | Rewrite `lib/ai/anthropic.ts` internals to `@ai-sdk/anthropic`, **preserving `callAnthropic`/`AnthropicCallArgs`/`AnthropicCallResult`**. Verify the ~8 callers + `ai-triage.test.ts` pass unchanged. | 1 helper (+8 verified) | Low | Single choke point; signature-preserving = tiny blast radius. |
| **5. Vision / multimodal** | Migrate `lib/ai/openai-vision.ts`, `lib/vision/openai-fallback.ts`, the vision routes (scan-part, scan-logbook), `vision-retranscribe.ts`, `ocr/direct-chunking.ts`, and **`native-pdf.ts`** (incl. the Gemini path → `@ai-sdk/google`). Switch image/PDF inputs to message parts. | ~8 (native-pdf is the heavy one) | Med–High | File-handling change + Responses API parity. Isolate `native-pdf.ts`. |
| **6. Transcription** | `voice/transcribe` + the two work-order message-upload routes → `experimental_transcribe`. | 3 | Med | API is experimental 🔎 — verify before committing; otherwise leave on raw fetch. |
| **7. The Ask route** | **Streaming is already live here — preserve it byte-for-byte (see §5).** Rebuild `/api/ask` tool loop on `streamText` + `tool()` + `stopWhen`. Re-express `lib/ai/tools.ts` as AI SDK tools. Map `fullStream` → the existing NDJSON events (keep `ask-experience.tsx` unchanged). Migrate blocking path first, then streaming, then the All-Aircraft fan-out. Also `owner/ask`, `sop/ask`, `sop/simulator` (these are **not** streaming). | 1 big + 3 | **High** | Most complex; do last with the wrapper + patterns battle-tested. |
| **8. Cleanup** | Remove the raw `openai` dependency from `apps/web` (and `trigger/`) **iff** no direct usages remain. Remove hand-rolled backoff superseded by `maxRetries`. Update docs (`docs/myaircraft-rag-system-overview.md`) + sub-processor disclosure. | — | Low | Only after every call site is migrated. |

> The 3 raw-`fetch` agents (`rag-query-rewriter`, `rag-answer-grader`, `support-bug-triage`) fold into Phase 2; the Cohere agent is intentionally **not** migrated.

---

## 7. Cross-cutting concerns & decisions

- **Cost-logging parity (must-have).** Map SDK `usage.inputTokens`/`outputTokens` → existing `ai_activity_log` columns and `agent_runs.tokens_in/out` via `lib/ai/llm/log.ts`. This is the contract every wrapper must honor. *Opportunity:* migrating also **closes the gap** where direct-OpenAI calls are currently unlogged — but that means new rows will start appearing for flows that were previously silent (expected, but note it so nobody reads it as a regression/spend spike).
- **Retries & timeouts.** Replace the hand-rolled exponential backoff in `embeddings.ts` and `anthropic.ts` with the SDK's `maxRetries` (+ `abortSignal: AbortSignal.timeout(...)` to preserve the 30s/60s caps). Fewer lines, same behavior.
- **Streaming client coupling (decision deferred — see Assumption A3).** Recommend **keeping the NDJSON protocol** and mapping it from `fullStream`, so `ask-experience.tsx` is untouched. A future, separate task can adopt `@ai-sdk/react` `useChat` + `toUIMessageStreamResponse()` if we want the SDK's first-class streaming UX.
- **Edge vs Node runtime.** The SDK works in both, but Whisper/file handling and `native-pdf.ts` are Node-only today. Keep those routes on the Node runtime; don't introduce edge as part of this migration.
- **Models unchanged.** This is a **provider-plumbing** migration, not a model upgrade. Keep `gpt-4o`/`gpt-4o-mini`/`claude-sonnet-4-5`/`gemini-3-flash-preview` and all `OPENAI_*_MODEL` env overrides exactly as they are, so the diff is reviewable and output behavior is stable.
- **Testing.** Existing vitest suites (`ai-triage.test.ts`, vision tests) assert against the old shapes. The SDK ships `MockLanguageModelV2` / `MockEmbeddingModelV2` — use these to unit-test wrappers and to keep agent/route tests deterministic. Budget test updates into each phase.
- **`trigger/` is a separate package.** It needs its own `pnpm add ai @ai-sdk/openai` and its own cutover (Phase 1/8); it can't import `apps/web` node_modules transitively in all cases.

---

## 8. Risks & gotchas

1. **`/api/ask` behavioral drift.** The tool loop, the "preamble vs final answer" reset logic, and the global citation-renumbering in the fan-out are subtle. *Mitigation:* migrate the blocking path first and diff its JSON output against the current route on a fixed question set before touching streaming.
2. **Embedding dimension mismatch.** Prod stores `pgvector(1536)`; `text-embedding-3-large` defaults to 3072. The current code pins `dimensions: 1536`. *Mitigation:* assert 1536 in a test; the SDK passes it via `providerOptions.openai.dimensions`.
3. **Responses API vs Chat Completions in `native-pdf.ts`.** Confirm `openai.responses()` parity for the structured-OCR calls, or pin those to `openai.chat()`.
4. **v5/v6 renamed symbols (🔎).** `maxTokens`→`maxOutputTokens`, `maxSteps`→`stopWhen: stepCountIs()`, `usage.promptTokens`→`usage.inputTokens`. Verify against installed types up front; a wrong field silently zeroes token logging.
5. **Gemini env-var name.** `GEMINI_API_KEY` vs the provider's default `GOOGLE_GENERATIVE_AI_API_KEY` — construct the provider explicitly to avoid a silent "no key" failure (§1).
6. **New `ai_activity_log` volume.** Closing the OpenAI logging gap increases row writes; confirm the table/retention can absorb it.
7. **Bundle / install size.** Three provider packages added; offset by eventually dropping the raw `openai` dep. Net roughly neutral.

---

## 9. Assumptions I made (you were away — please confirm/correct)

- **A1.** "Versatile asdk" = **Vercel AI SDK** (`ai` package). Everything here assumes that.
- **A2.** Target the **latest, `ai@^6`** (your "latest version" ask), accepting the v5 API shapes. If you'd rather pin v5 for any reason, the plan is unchanged except the version.
- **A3.** **Keep the existing NDJSON streaming protocol** — it is **already shipped** and **already consumed** by `ask-experience.tsx` (verified against current code). Map the SDK's `fullStream` onto the current events so the client stays untouched; do not rewrite to `useChat` in this migration (lower risk). Flag if you'd rather adopt the full `@ai-sdk/react` `useChat` + `toUIMessageStreamResponse()` treatment instead (a larger client-side change).
- **A4.** **No model upgrades** as part of this — provider plumbing only.
- **A5.** **Cohere reranking stays as raw `fetch`** (no AI SDK core primitive). 
- **A6.** **Whisper transcription** migrates via the SDK's `experimental_transcribe`; acceptable to keep on raw `fetch` if you'd rather not depend on an experimental API.
- **A7.** `apps/mobile` and the GPU vision workers are out of scope (confirmed no direct LLM calls / not LLM calls).

---

## 10. Suggested first step (once you approve)

Phase 0 only: add the deps and build `lib/ai/llm/*` with `generate` + `structured` + `embed` wrappers and their `ai_activity_log` tests — **no call sites touched.** That alone is reviewable in isolation and unblocks every later phase. I'll wait for your go-ahead before writing any code.

---

## Appendix A — Full per-file inventory

### A.1 Agents (`lib/agents/impl/`) — 14 LLM-calling of ~51

| File | Provider | Model (env override) | Operation | Mechanism |
|---|---|---|---|---|
| inbox-classifier.ts | OpenAI | gpt-4o-mini (`OPENAI_INBOX_CLASSIFIER_MODEL`) | JSON | inline `new OpenAI()` |
| inbox-expense-extractor.ts | OpenAI | gpt-4o (`OPENAI_INBOX_EXTRACTOR_MODEL`) | JSON + vision | inline `new OpenAI()` |
| inbox-estimate-parser.ts | OpenAI | gpt-4o (`OPENAI_INBOX_EXTRACTOR_MODEL`) | JSON | inline `new OpenAI()` |
| inbox-invoice-importer.ts | OpenAI | gpt-4o (`OPENAI_INBOX_EXTRACTOR_MODEL`) | JSON | inline `new OpenAI()` |
| support-first-responder.ts | OpenAI | gpt-4o (`OPENAI_CHAT_MODEL`) | JSON | inline `new OpenAI()` |
| support-triage.ts | OpenAI | gpt-4o-mini (`OPENAI_TRIAGE_MODEL`) | JSON | inline `new OpenAI()` |
| support-kb-curator.ts | OpenAI | gpt-4o-mini (`OPENAI_CURATOR_MODEL`) | JSON | inline `new OpenAI()` |
| ux-suggested-followups.ts | OpenAI | gpt-4o-mini (`OPENAI_FOLLOWUP_MODEL`) | JSON | inline `new OpenAI()` |
| ux-empty-state-coach.ts | OpenAI | gpt-4o-mini (`OPENAI_EMPTY_STATE_MODEL`) | JSON | inline `new OpenAI()` |
| ux-error-explainer.ts | OpenAI | gpt-4o-mini (`OPENAI_ERROR_EXPLAINER_MODEL`) | JSON | inline `new OpenAI()` |
| rag-query-rewriter.ts | OpenAI | gpt-4o-mini | JSON | raw `fetch` |
| rag-answer-grader.ts | OpenAI | gpt-4o-mini | JSON | raw `fetch` |
| support-bug-triage.ts | OpenAI | gpt-4o-mini | JSON | raw `fetch` |
| rag-rerank-cache-warmer.ts | **Cohere** | rerank-v3.5 | **rerank** | raw `fetch` — *out of scope* |

*~37 no-LLM agents (compliance-\*, data-quality-\*, ops-\*, safety-\*, sales-\*, security-\*, workforce-\*, knowledge-\*, rag-citation-validator, rag-context-compressor) need no migration.*

### A.2 API routes (`app/api/`) — ~16 LLM-calling

| Route | Provider | Model | Operation | Streaming | Mechanism | Logs? |
|---|---|---|---|---|---|---|
| /api/ask | OpenAI | gpt-4o (`OPENAI_CHAT_MODEL`) | chat + **tools** | **Yes (NDJSON)** | inline | partial |
| /api/owner/ask | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/sop/ask | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/sop/simulator | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/voice/transcribe | OpenAI | whisper-1 | transcription | No | raw `fetch` | **Yes** |
| /api/voice/intent | Anthropic | claude-sonnet-4-5 | JSON | No | `callAnthropic` | **Yes** |
| /api/vision/scan-part | Anthropic | claude-sonnet-4-5 | vision→JSON | No | `callAnthropic` | **Yes** |
| /api/vision/scan-logbook | Anthropic | claude-sonnet-4-5 | vision→JSON | No | `callAnthropic` | **Yes** |
| /api/work-orders/[id]/messages/upload | OpenAI | whisper-1 | transcription | No | inline | best-effort |
| /api/owner/work-orders/[id]/messages/upload | OpenAI | whisper-1 | transcription | No | inline | best-effort |
| /api/work-orders/[id]/ai-plan | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/work-orders/[id]/ai-summary | OpenAI | gpt-4o (`OPENAI_CHAT_MODEL`) | text | No | inline | No |
| /api/squawks/structure | OpenAI | gpt-4o-mini | JSON | No | inline | No |
| /api/reminders/ai-parse | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/ocr/review/draft | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/aircraft/[id]/analyze-discrepancies | OpenAI | gpt-4o | JSON | No | inline | No |
| /api/aviation/suggest-ata-jasc | OpenAI | gpt-4o-mini | JSON | No | inline | No |
| /api/aircraft/[id]/suggest-categories | OpenAI | gpt-4o-mini | JSON | No | inline | No |
| /api/ai/generate-checklist, /api/ai/generate-logbook, /api/maintenance/generate, /api/estimates/[id]/generate-summary, /api/admin/ingestion-health/suggest | OpenAI | gpt-4o(-mini) | JSON | No | inline | No |

*`/api/query` orchestrates RAG (embeddings + retrieval + calls `lib/rag/generation`) but the model call lives in the lib, not the route. Several `/api/ai/*` and `/api/cron/*` routes invoke **agents** via the runner rather than calling a model directly.*

### A.3 Core libs (`lib/`) — ~24 LLM-calling

| File | Provider | Model | Operation | Mechanism | Logs? |
|---|---|---|---|---|---|
| lib/openai/embeddings.ts | OpenAI | text-embedding-3-large | embeddings | inline `new OpenAI()` | No |
| lib/rag/generation.ts | OpenAI | gpt-4o | JSON | inline | partial |
| lib/rag/contextual.ts | OpenAI | gpt-4o-mini | text | inline | varies |
| lib/rag/hyde.ts | OpenAI | gpt-4o-mini | text | inline | No |
| lib/rag/aggregation.ts | OpenAI | gpt-4o-mini | JSON | inline | No |
| lib/rag/router-classifier.ts | OpenAI | text-embedding-3-large | embeddings | via `generateEmbeddings` | No |
| lib/rag/intelligence-query.ts | OpenAI | text-embedding-3-large | embeddings | via `generateEmbeddings` | No |
| lib/ask/condense.ts | OpenAI | gpt-4o-mini (`OPENAI_CONDENSE_MODEL`) | text | passed-in client | No |
| lib/ask/question-classifier.ts | OpenAI | gpt-4o-mini | JSON | inline | No |
| lib/ingestion/native-pdf.ts | OpenAI **+ Gemini** | gpt-4o / gemini-3-flash-preview | vision OCR + JSON (multi-site, Responses API, Files API, raw Gemini fetch) | mixed | partial |
| lib/ingestion/server.ts | OpenAI + Anthropic | text-embedding-3-large + claude | embeddings + extraction | `generateEmbeddings` + `callAnthropic` | via helper |
| lib/ingestion/vision-retranscribe.ts | OpenAI | gpt-4o vision | vision | inline | No |
| lib/ocr/direct-chunking.ts | OpenAI **or** Gemini | gpt-4o / gemini-3-flash-preview | vision→JSON | inline / fetch (provider switch) | No |
| lib/ai/openai-vision.ts | OpenAI | gpt-4o | vision | wrapper `callOpenAiVision` | **Yes** |
| lib/vision/openai-fallback.ts | OpenAI | gpt-4o | vision | `callOpenAiVision` | **Yes** |
| lib/ai/extractors/{router,cost-receipt,maintenance-invoice,insurance-declaration}.ts | Anthropic | claude-sonnet-4-5 | JSON | `callAnthropic` | **Yes** |
| lib/ai/predictors/run.ts | Anthropic | claude | text (narration) | `callAnthropic` | **Yes** |
| lib/ai/inspectors/wo-auditor.ts, lib/ai/analyzers/aircraft-analysis.ts, lib/ai/cards/generators.ts | OpenAI/Anthropic | gpt-4o / claude | JSON/text | mixed | varies |
| lib/support/ai-triage.ts | Anthropic | claude-3-5-haiku-latest → claude-sonnet-4-5 | JSON | `callAnthropic` | **Yes** |
| lib/parts/ai-resolve.ts | OpenAI | gpt-4o | JSON | inline | No |
| lib/economics/operating-cost-ai.ts | OpenAI | gpt-4o (`OPENAI_CHAT_MODEL`) | JSON | inline | No |
| lib/documents/auto-classify.ts | OpenAI | gpt-4o | JSON | inline | No |
| lib/aircraft/intelligence-ai.ts | OpenAI | gpt-4o (`OPENAI_CHAT_MODEL`) | text | inline | No |
| lib/intelligence/reports/{annualInspectionSummary,complianceAdReport,prebuyPacket,aircraftOverview}.ts | OpenAI | gpt-4o | text | inline | No |

### A.4 Scripts (`apps/web/scripts/`) + Trigger (`trigger/`)

| File | Area | Provider | Model | Operation | Mechanism |
|---|---|---|---|---|---|
| trace-ask.ts | scripts | OpenAI | gpt-4o | chat+tools | inline |
| finish-stuck-ingestions.ts | scripts | OpenAI | text-embedding-3-large | embeddings | inline |
| recontextualize-one-doc.ts | scripts | OpenAI | gpt-4o-mini + embeddings | text + embeddings | inline |
| retrieval-eval-run.ts, test-rpc-direct.ts, diagnose-craig.ts, diagnose-retrievechunks.ts, retrieval-eval-diagnose2.ts | scripts | OpenAI | (via lib helpers) | embeddings/HyDE/answer | imports `@/lib/...` |
| wave2-contextualize.mjs, wave2-pilot.mjs | scripts | OpenAI | gpt-4o-mini + embeddings | text + embeddings | inline (ESM) |
| wave2-eval.mjs | scripts | OpenAI | text-embedding-3-large | embeddings | inline (ESM) |
| ocr-pilot.mjs | scripts | OpenAI | gpt-4o (vision) + gpt-4o-mini (judge) | vision | inline (ESM) |
| trigger/jobs/ingest-document.ts | trigger | OpenAI | text-embedding-3-large (`OPENAI_EMBEDDING_MODEL`) | embeddings | inline `new OpenAI()` (own dep) |

*Scripts that import `@/lib/openai/embeddings` / `@/lib/rag/*` migrate automatically when those libs migrate. The `.mjs` scripts + `trace-ask.ts` + `finish-stuck-ingestions.ts` + the trigger job have their own clients and migrate individually (low priority — offline tooling).*
