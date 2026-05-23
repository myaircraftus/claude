/**
 * content.seo-suggester
 *
 * Weekly Mon 02:00 UTC: inspects the blog corpus + the trailing 7 days
 * of ask_logs and recommends the next SEO post to write.
 *
 * Heuristic-only — no LLM. Signals:
 *   - Top 20 most-frequent normalised /api/ask questions in the last
 *     7 days. Questions that don't already have a covering blog post
 *     are "demand without supply".
 *   - Recurring AD numbers / aircraft tails seen in inbox_messages —
 *     these surface real owner pain points (an AD that keeps coming
 *     up is one a blog post should explain).
 *   - The published blog post list (read from content/blog at runtime
 *     would require fs access — we approximate by holding an opt-in
 *     list of "covered slugs" passed in via SEO_BLOG_COVERED env, or
 *     just listing every blog_posts row when that table exists).
 *
 * Emits content_seo_suggestions recommendation with the top 5 gaps
 * and a one-line suggested headline for each.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface SeoGap {
  topic: string
  signal: 'ask_demand' | 'inbox_recurring_AD' | 'inbox_recurring_topic'
  weight: number
  example_question: string | null
  suggested_headline: string
}

export interface SeoReport {
  ask_log_count: number
  inbox_message_count: number
  gap_count: number
  gaps: SeoGap[]
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

// Cheap "is this an aviation topic" filter so we don't blog about
// "where is my food coupon"
const AVIATION_KEYWORDS =
  /(annual|100[-\s]?hour|airworth|AD\b|airworthiness directive|service bulletin|sb-?\d|prop|engine|tach|hobbs|carb|cylinder|magneto|spark plug|elt|transponder|altimeter|pitot|static|VOR|VFR|IFR|FAR|FAA|logbook|N\d{2,5}[A-Z]?|cessna|piper|beech|cirrus|mooney|baron|bonanza|navion|grumman|cherokee|comanche|skyhawk|172|182|150|310|140|warrior|archer|arrow|saratoga|seneca|seminole|aerostar|ovation)/i

function suggestHeadline(topic: string): string {
  // Map common patterns to high-intent headlines
  if (/cost|price|how much/i.test(topic)) {
    return `${topic.charAt(0).toUpperCase() + topic.slice(1)} — Actual Costs Owners Paid in 2026`
  }
  if (/how to|how do|what is|when do/i.test(topic)) {
    return `${topic.charAt(0).toUpperCase() + topic.slice(1)} — A Pilot's Step-by-Step Guide`
  }
  if (/AD|airworth/i.test(topic)) {
    return `${topic.charAt(0).toUpperCase() + topic.slice(1)} — What Owners Need to Know`
  }
  return `${topic.charAt(0).toUpperCase() + topic.slice(1)} — Owner's 2026 Field Guide`
}

export async function suggestSeoTopics(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: SeoReport; runId?: string; error?: string }> {
  return runAgent<SeoReport>(
    'content.seo-suggester',
    { supabase: args.supabase, input: {} },
    async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // 1) Top-of-funnel demand: most-asked /api/ask questions
      const { data: asks } = await args.supabase
        .from('ask_logs')
        .select('question')
        .gte('created_at', since)
        .not('question', 'is', null)
        .limit(5000)
      const counts = new Map<string, { count: number; example: string }>()
      for (const r of (asks ?? []) as Array<{ question: string }>) {
        if (!AVIATION_KEYWORDS.test(r.question)) continue
        const key = normalise(r.question)
        if (key.length < 12) continue
        const existing = counts.get(key) ?? { count: 0, example: r.question }
        existing.count += 1
        counts.set(key, existing)
      }
      const topAsks = Array.from(counts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)

      // 2) Inbox-side signals: AD numbers + recurring topics in inbox bodies
      const { data: inbox } = await args.supabase
        .from('inbox_messages')
        .select('subject, body_text')
        .gte('created_at', since)
        .limit(2000)
      const adRefs = new Map<string, number>()
      for (const m of (inbox ?? []) as Array<{ subject: string | null; body_text: string | null }>) {
        const text = `${m.subject ?? ''} ${m.body_text ?? ''}`
        for (const match of text.matchAll(/\bAD[\s-]?(\d{2,4}-\d{1,4}(?:-\d{1,3})?)\b/gi)) {
          const key = `AD ${match[1]}`
          adRefs.set(key, (adRefs.get(key) ?? 0) + 1)
        }
      }
      const topAds = Array.from(adRefs.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

      // 3) Existing post list — best-effort via a blog_posts table if it
      // exists, else nothing (the agent still surfaces demand topics)
      const covered = new Set<string>()
      try {
        const { data: posts } = await args.supabase
          .from('blog_posts')
          .select('slug, title')
          .eq('status', 'published')
          .limit(1000)
        for (const p of (posts ?? []) as Array<{ slug: string; title: string }>) {
          covered.add(normalise(p.title))
        }
      } catch {
        // table absent — fine
      }

      const gaps: SeoGap[] = []
      for (const [key, info] of topAsks) {
        if (covered.has(key)) continue
        gaps.push({
          topic: key,
          signal: 'ask_demand',
          weight: info.count,
          example_question: info.example,
          suggested_headline: suggestHeadline(key),
        })
      }
      for (const [ad, count] of topAds) {
        gaps.push({
          topic: ad,
          signal: 'inbox_recurring_AD',
          weight: count,
          example_question: null,
          suggested_headline: `${ad} compliance — What's required, when it's due, and the typical cost`,
        })
      }
      gaps.sort((a, b) => b.weight - a.weight)

      return {
        output: {
          ask_log_count: (asks ?? []).length,
          inbox_message_count: (inbox ?? []).length,
          gap_count: gaps.length,
          gaps: gaps.slice(0, 10),
        },
        needsHuman: gaps.length > 0,
        recommendation:
          gaps.length > 0
            ? {
                kind: 'content_seo_suggestions',
                gap_count: gaps.length,
                top_gaps: gaps.slice(0, 5),
              }
            : null,
      }
    },
  )
}
