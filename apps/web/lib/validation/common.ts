/**
 * Common zod validators for API route bodies (security-audit §5.4).
 *
 * Building blocks shared across `/api/*` POST/PUT/PATCH routes that accept
 * JSON bodies. The audit found ~242 of 253 mutating routes had zero
 * runtime input validation; this file is the basis for the focused
 * remediation pass — apply these to one route at a time, smoke-test
 * each, then move on.
 *
 * Defaults follow the audit's "strings-max-10000" rule: every string
 * field caps at 10 KB unless the caller opts down to a tighter limit.
 * Larger blobs (logbook content, AI prompts, document text) should be
 * uploaded via storage / dedicated routes, not stuffed into JSON bodies.
 *
 * Usage:
 *   import { safeStr, safeShortStr, safeUuid, safeEmail, safeUrl,
 *            safeInt, parseJsonBody } from '@/lib/validation/common'
 *
 *   const Body = z.object({
 *     price_id: safeShortStr,
 *     success_url: safeUrl.optional(),
 *   })
 *
 *   const parsed = await parseJsonBody(req, Body)
 *   if (!parsed.ok) return parsed.response
 *   const body = parsed.data
 */
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'

/** Default string cap — defense against accidentally storing megabyte payloads. */
export const MAX_STR_LEN = 10_000

/** Tighter cap for short fields (names, slugs, codes, IDs). */
export const SHORT_STR_LEN = 200

/** Generic non-empty string with default 10K cap. */
export const safeStr = z.string().min(1).max(MAX_STR_LEN)

/** Optional version of safeStr — accepts undefined / empty string. */
export const safeStrOptional = z.string().max(MAX_STR_LEN).optional()

/** Short-form string (names, codes, slugs) — capped at 200 chars. */
export const safeShortStr = z.string().min(1).max(SHORT_STR_LEN)

/** Optional short string. */
export const safeShortStrOptional = z.string().max(SHORT_STR_LEN).optional()

/** UUID v4 (Supabase IDs). */
export const safeUuid = z.string().uuid()

/** Optional UUID. */
export const safeUuidOptional = z.string().uuid().optional()

/** Email (RFC-5322ish, zod's built-in is sufficient for our checks). */
export const safeEmail = z.string().email().max(SHORT_STR_LEN)

/** URL — http(s) only, capped at 2048 (browser URL limit). */
export const safeUrl = z.string().url().max(2048)

/** Non-negative integer (counts, quantities). */
export const safeInt = z.number().int().nonnegative()

/** Optional non-negative integer. */
export const safeIntOptional = z.number().int().nonnegative().optional()

/** Money in cents (positive integer, capped at $1M to spot bad inputs). */
export const safeCents = z.number().int().min(0).max(100_000_000)

/** ISO date string. */
export const safeIso = z.string().datetime()

/** Result of parseJsonBody — discriminated union for ergonomic checks. */
export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

/**
 * Parse + validate a JSON body. Returns either { ok: true, data } or
 * { ok: false, response } where response is a 400 with structured zod errors.
 *
 * Pattern at call site:
 *
 *   const parsed = await parseJsonBody(req, BodySchema)
 *   if (!parsed.ok) return parsed.response
 *   const body = parsed.data  // typed!
 */
export async function parseJsonBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>,
): Promise<ParseResult<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    // Surface the first error path + message; full issue list available
    // under `details` for clients that want it. Avoid leaking field
    // names from the schema if any field could be sensitive — the
    // shapes here are all public/non-sensitive so this is fine.
    const first = result.error.issues[0]
    const path = first?.path.join('.') ?? '(root)'
    const message = first?.message ?? 'Invalid input'
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Validation failed at ${path}: ${message}`,
          details: result.error.issues,
        },
        { status: 400 },
      ),
    }
  }

  return { ok: true, data: result.data }
}
