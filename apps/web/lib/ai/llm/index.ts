/**
 * Unified LLM layer — the single surface for every model call in the app.
 *
 * Built on the Vercel AI SDK (`ai` v6 + @ai-sdk/openai|anthropic|google).
 * See docs/vercel-ai-sdk-migration-plan.md for the full design + rollout.
 */
export * from './types'
export * from './pricing'
export * from './log'
export * from './provider'
export * from './generate'
export * from './structured'
export * from './embed'
export * from './transcribe'
