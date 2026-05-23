/**
 * Agent Fleet — registry of every AI agent in the platform.
 *
 * Every agent in this file:
 *   - has a stable `id` used to look it up + audit it
 *   - has an explicit purpose (one sentence) so a human can read this
 *     file and know what the agent does without reading the impl
 *   - has a trigger (api_request / cron / chained / human-button)
 *   - has a status (active / proposed / paused) so we can ship the
 *     framework before all agents are implemented
 *   - has a recommended_provider + recommended_model so cost + model
 *     swaps are auditable
 *   - has a writes? flag indicating whether it can mutate data on its
 *     own or only propose recommendations for a human to approve
 *
 * Add new agents by appending to AGENTS. Implementations live in
 * lib/agents/impl/<agent-id>.ts. The registry doesn't import the
 * implementations — that's the runner's job — so we can add agents
 * to the manifest before code lands.
 *
 * Audit log lives in the agent_runs table.
 */

export type AgentStatus = 'active' | 'proposed' | 'paused' | 'deprecated'

export interface AgentDefinition {
  /** Stable identifier — same string used in agent_runs.agent_id. */
  id: string
  /** Short human label. */
  label: string
  /** One-sentence description of what the agent does. */
  purpose: string
  /** Category for the admin agent console. */
  category:
    | 'support'
    | 'knowledge'
    | 'safety'
    | 'data-quality'
    | 'ux-help'
    | 'compliance'
    | 'ops'
    | 'rag'
    | 'workforce'
    | 'sales'
  /** Trigger source. */
  trigger:
    | 'api_request'
    | 'cron'
    | 'chained'
    | 'human_button'
    | 'event_trigger'
  /** Active = wired and running. Proposed = manifest only, no impl yet. */
  status: AgentStatus
  /** Lab-recommended provider. Can be overridden at runtime. */
  recommended_provider: 'openai' | 'anthropic' | 'cohere' | 'mixed' | 'none'
  /** Lab-recommended model. */
  recommended_model: string
  /** Can the agent mutate data on its own, or does it only recommend? */
  writes: boolean
  /** If the agent runs on a cron, the schedule (text only — Vercel cron strings live in vercel.json / vercel.ts). */
  cron_schedule?: string
  /** Free-text doc / SOP reference. */
  reference?: string
}

export const AGENTS: AgentDefinition[] = [
  // ── SUPPORT
  {
    id: 'support.first-responder',
    label: 'Support first-responder',
    purpose:
      'Answer any user help question from the unified launcher. Searches the support KB + SOP corpus + recent docs; if confident, drafts the answer; otherwise escalates to a human.',
    category: 'support',
    trigger: 'api_request',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: true, // writes the answer into support_tickets.messages
    reference: 'SOP-17 §10 (planned) + lib/agents/impl/support-first-responder.ts',
  },
  {
    id: 'support.kb-curator',
    label: 'KB curator',
    purpose:
      'Read resolved support tickets nightly. When a ticket pattern repeats (≥3 similar tickets in the last 30 days), propose a draft KB entry for the founder to approve.',
    category: 'knowledge',
    trigger: 'cron',
    cron_schedule: '0 4 * * *', // 04:00 UTC daily
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true, // writes drafts only — published flips by human
  },
  {
    id: 'support.triage',
    label: 'Ticket triage',
    purpose:
      'Classify every new support ticket (billing / how-to / bug / feature-request / outage / other) and set severity (info / warn / urgent). Runs in parallel with the first-responder.',
    category: 'support',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true, // sets support_tickets.category + severity
  },

  // ── DATA QUALITY
  {
    id: 'data-quality.ocr-date-sanitiser',
    label: 'OCR date sanitiser',
    purpose:
      'Sweep page_tree_nodes nightly. Null out impossible dates (outside aircraft.year - 1 → today + 1yr). Already enforced at query time; this is the at-rest version.',
    category: 'data-quality',
    trigger: 'cron',
    cron_schedule: '0 3 * * *',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: true,
    reference: 'supabase/migrations/20260522000000_sanitize_page_tree_dates.sql',
  },
  {
    id: 'data-quality.aircraft-year-backfiller',
    label: 'Aircraft.year backfiller',
    purpose:
      'For every aircraft.year IS NULL row, query the FAA Civil Aviation Registry by N-number / serial and propose a year. Founder approves before it commits.',
    category: 'data-quality',
    trigger: 'cron',
    cron_schedule: '0 5 * * 0', // Sunday 05:00
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: false, // proposes only
  },

  // ── RAG
  {
    id: 'rag.fleet-aggregator',
    label: 'Fleet aggregator',
    purpose:
      'Short-circuit /api/ask before the LLM for chronological extremum + count + sum aggregations. Already live in lib/ask/fleet-aggregation.ts.',
    category: 'rag',
    trigger: 'api_request',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
    reference: 'lib/ask/fleet-aggregation.ts',
  },
  {
    id: 'rag.rerank-cache-warmer',
    label: 'Rerank cache warmer',
    purpose:
      'Periodically re-runs the top-100 questions across all tenants to keep the Cohere rerank LRU cache warm (sub-second answers on common questions).',
    category: 'rag',
    trigger: 'cron',
    cron_schedule: '0 */6 * * *',
    status: 'proposed',
    recommended_provider: 'cohere',
    recommended_model: 'rerank-v3.5',
    writes: false,
  },
  {
    id: 'rag.citation-validator',
    label: 'Citation validator',
    purpose:
      'On every /api/ask answer, verify the LLM did not invent a chunkId. Drops any citation not in the retrieved set. Already inline in /api/ask answer-gen.',
    category: 'safety',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },

  // ── COMPLIANCE
  {
    id: 'compliance.audit-event-watchdog',
    label: 'Audit event watchdog',
    purpose:
      'Cron-run integrity check on audit_event chain. Detects gaps or tampering attempts. Files a CRITICAL agent_run if integrity breaks.',
    category: 'compliance',
    trigger: 'cron',
    cron_schedule: '0 * * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
    reference: 'SOP-19 §3.4',
  },
  {
    id: 'compliance.soc2-evidence-collector',
    label: 'SOC2 evidence collector',
    purpose:
      'Quarterly job that gathers the SOC2 quarterly evidence packet (access review, change log, backup verification, vuln scan, incident summary, vendor attestations).',
    category: 'compliance',
    trigger: 'cron',
    cron_schedule: '0 0 1 */3 *', // first of every quarter
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true,
    reference: 'SOP-19 §5',
  },

  // ── UX HELP
  {
    id: 'ux-help.suggested-followups',
    label: 'Follow-up suggester',
    purpose:
      'After every /api/ask answer, propose 2-3 natural follow-up questions the user might ask next. Live inline in /api/ask responses.',
    category: 'ux-help',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'ux-help.bug-triage',
    label: 'Bug triage from support',
    purpose:
      'When a support ticket is classified category=bug, extract a structured reproduction (browser, route, action, expected, actual) and file an internal issue draft for the founder.',
    category: 'support',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: false,
  },

  // ── WORKFORCE
  {
    id: 'workforce.clock-anomaly',
    label: 'Clock anomaly detector',
    purpose:
      'Flag time-clock entries that look wrong: shifts >16 hours, missing clock-outs, overlapping shifts, unlikely productivity ratios.',
    category: 'workforce',
    trigger: 'cron',
    cron_schedule: '0 6 * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
    reference: 'SOP-10 §6',
  },
  {
    id: 'workforce.cert-expiry-alerter',
    label: 'Cert-expiry alerter',
    purpose:
      'Watch mechanic_certificate_history. 60/30/7-day warning emails when an IA renewal, A&P cert, or medical is due to expire.',
    category: 'workforce',
    trigger: 'cron',
    cron_schedule: '0 8 * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: true,
  },

  // ── OPS
  {
    id: 'ops.cron-health',
    label: 'Cron health monitor',
    purpose:
      'Verify every cron in this manifest ran successfully in the last 24h. If a cron is missing or failed, page the founder.',
    category: 'ops',
    trigger: 'cron',
    cron_schedule: '*/30 * * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },
  {
    id: 'ops.error-rate-sentinel',
    label: 'Error-rate sentinel',
    purpose:
      'Read Sentry error events hourly. If the 5xx rate exceeds 1% of requests OR a new error fingerprint appears in production, page the founder.',
    category: 'ops',
    trigger: 'cron',
    cron_schedule: '0 * * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: false,
  },

  // ── SALES (planned)
  {
    id: 'sales.lead-prep',
    label: 'Lead prep brief',
    purpose:
      'When a new shop signs up for a trial, generate a 1-pager brief for the founder with their fleet size, FAA registration data, and likely questions.',
    category: 'sales',
    trigger: 'event_trigger',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: false,
  },
]

/** Find an agent by id; throws if not found. */
export function getAgent(id: string): AgentDefinition {
  const a = AGENTS.find((x) => x.id === id)
  if (!a) throw new Error(`Unknown agent id: ${id}`)
  return a
}

/** All currently-active agents. */
export function activeAgents(): AgentDefinition[] {
  return AGENTS.filter((a) => a.status === 'active')
}
