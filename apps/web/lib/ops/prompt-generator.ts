/**
 * Phase 16 Sprint 16.11 — Claude Code prompt generator.
 *
 * Loads full context for an ops_event (ticket / error / alert), greps
 * the repo for files referenced in the stack/route/body, asks AI to
 * suggest a fix approach, then assembles a markdown prompt admin can
 * paste straight into Claude Code.
 *
 * Output sections:
 *   1. Fix this issue: [summary]
 *   2. Reproduction
 *   3. Affected
 *   4. Relevant files (read-only context)
 *   5. Suggested fix approach
 *   6. Test requirements
 *   7. Hard rules — sacred boundaries + commit format
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsSourceType } from './spine'

export interface GeneratedPrompt {
  prompt_text: string
  context_files: Array<{ path: string; reason: string }>
  ai_analysis: string | null
  metadata: Record<string, unknown>
}

interface SourceContext {
  type: OpsSourceType
  id: string
  /** Human-readable label (ticket_number / stack_hash / alert_type). */
  label: string
  /** One-paragraph summary used in the prompt. */
  summary: string
  /** Detailed body — error stack, ticket conversation, etc. */
  detail: string
  /** Affected route(s) when known. */
  routes: string[]
  /** Affected persona(s) when known. */
  personas: string[]
  /** Org id when scoped. */
  organization_id: string | null
  /** Creation time of the event. */
  created_at: string
}

// ──────────────────────────────────────────────────────────────────────
// Context loaders — one per source_type
// ──────────────────────────────────────────────────────────────────────

async function loadSupportTicket(
  supabase: SupabaseClient,
  id: string,
): Promise<SourceContext | null> {
  const { data: t } = await supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, body, category, severity, submitter_email, organization_id, tags, created_at, suggested_response, triage_classification')
    .eq('id', id)
    .maybeSingle()
  if (!t) return null
  const tk = t as any

  const { data: replies } = await supabase
    .from('ticket_replies')
    .select('body, is_from_ai, is_from_admin, is_from_customer, created_at')
    .eq('ticket_id', tk.id)
    .order('created_at', { ascending: true })
    .limit(20)

  const thread = ((replies ?? []) as Array<any>)
    .map((r) => `[${r.is_from_ai ? 'AI' : r.is_from_admin ? 'admin' : 'customer'}] ${r.body}`)
    .join('\n\n')

  return {
    type: 'support_ticket',
    id: tk.id,
    label: tk.ticket_number,
    summary: tk.subject,
    detail: [
      `Initial message: ${tk.body}`,
      thread ? `\nThread:\n${thread}` : '',
      tk.suggested_response ? `\nAI suggested response (admin draft):\n${tk.suggested_response}` : '',
    ].filter(Boolean).join('\n'),
    routes: [],
    personas: [],
    organization_id: tk.organization_id,
    created_at: tk.created_at,
  }
}

async function loadErrorEvent(
  supabase: SupabaseClient,
  id: string,
): Promise<SourceContext | null> {
  const { data: e } = await supabase
    .from('error_events')
    .select('id, message, stack, route, persona, severity, occurrence_count, last_seen_at, build_sha, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (!e) return null
  const er = e as any
  return {
    type: 'error_event',
    id: er.id,
    label: er.message.slice(0, 80),
    summary: `${er.message} (×${er.occurrence_count})`,
    detail: [
      `Message: ${er.message}`,
      er.stack ? `\nStack:\n${er.stack}` : '',
      er.build_sha ? `Build: ${er.build_sha}` : '',
      `Severity: ${er.severity}`,
      `Occurrences: ${er.occurrence_count}`,
    ].filter(Boolean).join('\n'),
    routes: er.route ? [er.route] : [],
    personas: er.persona ? [er.persona] : [],
    organization_id: er.organization_id,
    created_at: er.last_seen_at,
  }
}

async function loadAlertEvent(
  supabase: SupabaseClient,
  id: string,
): Promise<SourceContext | null> {
  const { data: a } = await supabase
    .from('alert_events')
    .select('id, alert_type, severity, summary, metadata, fired_at, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (!a) return null
  const al = a as any
  return {
    type: 'alert_event',
    id: al.id,
    label: al.alert_type,
    summary: al.summary,
    detail: [
      `Alert: ${al.summary}`,
      `Type: ${al.alert_type}`,
      `Severity: ${al.severity}`,
      `Metadata: ${JSON.stringify(al.metadata, null, 2)}`,
    ].join('\n'),
    routes: [],
    personas: [],
    organization_id: al.organization_id,
    created_at: al.fired_at,
  }
}

async function loadSourceContext(
  supabase: SupabaseClient,
  source_type: OpsSourceType,
  id: string,
): Promise<SourceContext | null> {
  switch (source_type) {
    case 'support_ticket': return loadSupportTicket(supabase, id)
    case 'error_event':    return loadErrorEvent(supabase, id)
    case 'alert_event':    return loadAlertEvent(supabase, id)
    case 'feedback_item':
    case 'churn_signal':   return null  // not yet supported — admin can compose manually
  }
}

// ──────────────────────────────────────────────────────────────────────
// File path extraction + grep
// ──────────────────────────────────────────────────────────────────────

// Match repo-relative paths in stacks/messages. Word-boundary \b only
// fires between word + non-word chars, so we use a leading anchor set
// for paths that start with a literal `/`. Both `apps/web/...` and
// `/apps/web/...` are accepted; the normalization step strips any
// leading slash and adds the apps/web prefix for /lib /app /components
// shorthands.
const FILE_PATH_RE =
  /(?:^|[\s(])(\/?(?:apps\/web\/|supabase\/|\/?lib\/|\/?app\/|\/?components\/)[\w./@\-\[\]]+\.(?:ts|tsx|js|jsx|sql|md))/g

function extractFilePaths(detail: string, routes: string[]): string[] {
  const out = new Set<string>()
  // 1. Direct file references in the detail (stacks include them).
  for (const match of detail.matchAll(FILE_PATH_RE)) {
    let p = match[1]
    // Normalize leading slashes — we want the repo-relative path.
    if (p.startsWith('/')) p = p.slice(1)
    if (!p.startsWith('apps/') && !p.startsWith('supabase/')) {
      // /app/ or /lib/ shorthand → assume apps/web prefix
      p = `apps/web${p.startsWith('/') ? p : '/' + p}`
    }
    out.add(p)
  }
  // 2. Route → guessed page file. /aircraft/[id] → apps/web/app/(app)/aircraft/[id]/page.tsx
  for (const r of routes) {
    if (!r.startsWith('/')) continue
    const segs = r.split('/').filter(Boolean)
    if (segs.length === 0) continue
    // Guess (app) tree first; admin paths go in the same tree under admin/.
    out.add(`apps/web/app/(app)${r}/page.tsx`)
    // For API routes, route IS the path with /api prefix.
    if (segs[0] === 'api') {
      out.add(`apps/web/app${r}/route.ts`)
    }
  }
  return [...out].slice(0, 12)
}

const REPO_ROOT_REL = '../..'

async function readFileSafe(repoRoot: string, relPath: string, maxBytes = 8 * 1024): Promise<string | null> {
  try {
    const full = path.resolve(repoRoot, relPath)
    if (!full.startsWith(repoRoot)) return null  // path traversal guard
    const buf = await fs.readFile(full, 'utf8')
    return buf.length > maxBytes ? buf.slice(0, maxBytes) + '\n... [truncated]' : buf
  } catch {
    return null
  }
}

async function gatherContextFiles(
  candidates: string[],
): Promise<Array<{ path: string; preview: string | null; reason: string }>> {
  const repoRoot = path.resolve(process.cwd(), REPO_ROOT_REL)
  const out: Array<{ path: string; preview: string | null; reason: string }> = []
  for (const p of candidates) {
    const preview = await readFileSafe(repoRoot, p)
    if (preview != null) {
      out.push({ path: p, preview, reason: 'mentioned in stack/route' })
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────
// Prompt assembly
// ──────────────────────────────────────────────────────────────────────

const HARD_RULES_BLOCK = `
**Sacred boundaries — do not modify:**
- \`apps/web/lib/ocr/\`
- \`apps/web/lib/rag/\`
- \`apps/web/lib/embeddings/\`

**Commit format:** type(scope): subject. e.g. \`fix(support): handle null body in triage\`. Co-author footer is optional but encouraged.

**Branch:** stay on \`main\` unless the user explicitly asks for a feature branch.

**Test requirements:** every change should add or update vitest cases. Don't ship a bug fix without a regression test that reproduces the original failure.
`.trim()

export interface GeneratePromptOptions {
  /** Optional override for the AI analysis text (skip the model call). */
  ai_analysis?: string
  /** Skip the file-system read step (useful in tests). */
  skip_file_read?: boolean
}

export async function generateClaudeCodePrompt(
  supabase: SupabaseClient,
  source_type: OpsSourceType,
  source_id: string,
  options: GeneratePromptOptions = {},
): Promise<GeneratedPrompt | null> {
  const ctx = await loadSourceContext(supabase, source_type, source_id)
  if (!ctx) return null

  const candidates = extractFilePaths(ctx.detail, ctx.routes)
  const contextFiles = options.skip_file_read
    ? candidates.map((p) => ({ path: p, preview: null, reason: 'mentioned in stack/route' }))
    : await gatherContextFiles(candidates)

  const aiAnalysis = options.ai_analysis ?? null  // The AI-analysis Anthropic call lives in the route handler so this module stays pure for tests.

  const sections: string[] = []
  sections.push(`# Fix: ${ctx.summary}`)
  sections.push('')
  sections.push(`Source: \`${ctx.type}\` ${ctx.label} · severity from event · created ${new Date(ctx.created_at).toLocaleString()}`)
  sections.push('')
  sections.push(`## Reproduction`)
  sections.push(ctx.detail)
  sections.push('')
  sections.push(`## Affected`)
  sections.push(`- Route(s): ${ctx.routes.length ? ctx.routes.map((r) => `\`${r}\``).join(', ') : '(none captured)'}`)
  sections.push(`- Persona(s): ${ctx.personas.length ? ctx.personas.join(', ') : '(unknown)'}`)
  sections.push(`- Organization: ${ctx.organization_id ?? 'system-wide'}`)
  sections.push('')
  sections.push(`## Relevant files (read-only context)`)
  if (contextFiles.length === 0) {
    sections.push('_No files auto-extracted. Search the repo for symbols mentioned in the reproduction._')
  } else {
    for (const f of contextFiles) {
      sections.push(`- \`${f.path}\` — ${f.reason}`)
      if (f.preview) {
        sections.push('```')
        sections.push(f.preview)
        sections.push('```')
      }
    }
  }
  sections.push('')
  sections.push(`## Suggested fix approach`)
  sections.push(aiAnalysis ?? '_AI analysis not requested. Investigate the reproduction + relevant files; trace data flow from input to failure point; add a regression test before the fix._')
  sections.push('')
  sections.push(`## Test requirements`)
  sections.push('- Add a vitest case that reproduces the failure (red).')
  sections.push('- Confirm the fix turns the test green.')
  sections.push('- Run the full suite: `pnpm --filter @myaircraft/web test`.')
  sections.push('- Confirm no new TypeScript errors: `pnpm --filter @myaircraft/web typecheck` (or `tsc --noEmit -p apps/web/tsconfig.json`).')
  sections.push('')
  sections.push(`## Hard rules`)
  sections.push(HARD_RULES_BLOCK)

  return {
    prompt_text: sections.join('\n'),
    context_files: contextFiles.map((f) => ({ path: f.path, reason: f.reason })),
    ai_analysis: aiAnalysis,
    metadata: {
      source_type,
      source_id,
      file_candidates: candidates,
    },
  }
}

// Re-exports for tests.
export { extractFilePaths, loadSourceContext }
