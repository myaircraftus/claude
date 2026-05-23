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
  // ── INBOX (Phase 2 of the unified-inbox feature)
  {
    id: 'inbox.classifier',
    label: 'Inbox classifier',
    purpose:
      'Classify every inbound email/SMS into receipt / estimate / invoice / reminder / adhoc / spam / other. Chained off the Resend inbound webhook.',
    category: 'support',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true, // writes classified_as + classify_confidence on inbox_messages
  },
  {
    id: 'inbox.expense-extractor',
    label: 'Inbox expense extractor',
    purpose:
      'Read a classified-as-receipt inbox message + attachment, extract vendor / amount / date / category, and draft a cost_entries row (approved=false). Human reviews in the inbox UI.',
    category: 'data-quality',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: true,
  },
  {
    id: 'inbox.estimate-parser',
    label: 'Inbox estimate parser',
    purpose:
      'Read a classified-as-estimate inbox message, extract vendor / total / line items / valid-until, and draft an estimates row (status=draft). Human approves in the inbox UI.',
    category: 'data-quality',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: true,
  },
  {
    id: 'inbox.invoice-importer',
    label: 'Inbox invoice importer',
    purpose:
      'Read a classified-as-invoice inbox message, extract invoice number / total / dates, and draft an invoices row (status=draft). Human approves before paying.',
    category: 'data-quality',
    trigger: 'chained',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: true,
  },

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
    id: 'data-sync.tach-time-scraper',
    label: 'Tach-time scraper (browser automation)',
    purpose:
      "Daily: log into each owner's third-party system (Flight Schedule Pro, Flight Circle, etc.) via headless browser, scrape per-aircraft tach hours, reconcile against ours, emit recommendation rows for deltas + proposed new aircraft. Service-side credential storage is envelope-encrypted; passwords are never logged.",
    category: 'data-quality',
    trigger: 'cron',
    cron_schedule: '0 6 * * *',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: false, // emits recommendations only; never writes aircraft.total_time_hours directly
    reference: 'lib/agents/impl/data-sync-tach-time-scraper.ts + lib/agents/scrapers/',
  },
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
      "Daily sweep over mechanic_certificates. For any row expiring in 60/30/7 days (and renewal_reminder=true), emit a cert_expiry_soon recommendation tiered by severity. /admin/agents surfaces it.",
    category: 'workforce',
    trigger: 'cron',
    cron_schedule: '0 8 * * *',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
    reference: 'lib/agents/impl/workforce-cert-expiry-alerter.ts',
  },

  // ── OPS
  {
    id: 'ops.cron-health',
    label: 'Cron health monitor',
    purpose:
      'Verify every active cron agent has at least one succeeded run in the last ~24h. Emits a cron_missed recommendation for any agent that fell behind so /admin/agents surfaces it.',
    category: 'ops',
    trigger: 'cron',
    cron_schedule: '*/30 * * * *',
    status: 'active',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
    reference: 'lib/agents/impl/ops-cron-health.ts',
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

  // ── INGESTION + KNOWLEDGE (proposed)
  {
    id: 'data-quality.ad-reference-extractor',
    label: 'AD reference extractor',
    purpose:
      'When a logbook entry mentions an AD by number, link it to the FAA AD database and flag if the AD is open / superseded / closed for that aircraft.',
    category: 'data-quality',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true,
  },
  {
    id: 'data-quality.tail-number-validator',
    label: 'Tail-number validator',
    purpose:
      'Cross-checks every aircraft.tail_number against the live FAA Civil Aviation Registry. Flags mismatches (model/serial/make) for human review.',
    category: 'data-quality',
    trigger: 'cron',
    cron_schedule: '0 5 * * 1',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: false,
  },
  {
    id: 'data-quality.duplicate-doc-detector',
    label: 'Duplicate document detector',
    purpose:
      'After OCR completes, computes a content hash + first-page perceptual hash and flags pages that are byte-identical or near-duplicates so the same engine logbook isn\'t imported twice.',
    category: 'data-quality',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },
  {
    id: 'knowledge.sop-coverage-gap-detector',
    label: 'SOP coverage gap detector',
    purpose:
      'Reads the most-asked launcher questions weekly. If a high-frequency question has no SOP backing, drafts a one-line gap report for the founder.',
    category: 'knowledge',
    trigger: 'cron',
    cron_schedule: '0 6 * * 1',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'knowledge.faa-airworthiness-context',
    label: 'FAA airworthiness context fetcher',
    purpose:
      'On demand: for a given aircraft, fetch open ADs, SBs, and recent FSDO findings, summarise into a one-pager. Read-only; never recommends a sign-off.',
    category: 'knowledge',
    trigger: 'human_button',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: false,
  },

  // ── SAFETY / SECURITY (proposed)
  {
    id: 'safety.pii-leak-scanner',
    label: 'PII leak scanner',
    purpose:
      'Scans every outbound email + every marketplace listing for leaked PII (SSN, DOB, card numbers, phone in a public field). Quarantines the message + alerts ops.',
    category: 'safety',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true,
  },
  {
    id: 'safety.prompt-injection-guard',
    label: 'Prompt-injection guard',
    purpose:
      'Inspects every user-supplied document or chat message before it flows into a system-prompt. Detects classic injection patterns (ignore previous instructions, role overrides, exfil requests) and refuses to pass it through.',
    category: 'safety',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'safety.cross-tenant-leak-watchdog',
    label: 'Cross-tenant leak watchdog',
    purpose:
      'Random samples 1% of every RAG retrieval. Verifies every retrieved chunk\'s organization_id matches the requester. Files an immediate CRITICAL agent_run if mismatch.',
    category: 'safety',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },
  {
    id: 'security.failed-login-anomaly',
    label: 'Failed-login anomaly detector',
    purpose:
      'Reads auth.events. If a user account sees ≥10 failed logins in 15 minutes from ≥3 IPs, suspends the account and pages the founder + emails the user.',
    category: 'safety',
    trigger: 'cron',
    cron_schedule: '*/10 * * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: true,
  },

  // ── OPS (proposed)
  {
    id: 'ops.stripe-failed-charge-watcher',
    label: 'Stripe failed-charge watcher',
    purpose:
      'When a Stripe charge fails twice in a row, email the customer with a billing-portal link AND open an admin ticket so a human can call if they\'re a high-LTV account.',
    category: 'ops',
    trigger: 'event_trigger',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: true,
  },
  {
    id: 'ops.cost-anomaly-detector',
    label: 'Cost anomaly detector',
    purpose:
      'Daily: compute per-tenant OpenAI + Modal + Cohere spend. If a tenant\'s spend is ≥3σ above their 14-day rolling baseline, pause their AI surfaces and notify ops.',
    category: 'ops',
    trigger: 'cron',
    cron_schedule: '0 9 * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: true,
  },
  {
    id: 'ops.deployment-canary',
    label: 'Deployment canary',
    purpose:
      'After every Vercel production deploy, runs a 60-second synthetic smoke test (signup, signin, /api/ask sample question, /api/me) and rolls back if any path returns 5xx.',
    category: 'ops',
    trigger: 'event_trigger',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'http-only',
    writes: false,
  },

  // ── COMPLIANCE (proposed)
  {
    id: 'compliance.gdpr-export-fulfilment',
    label: 'GDPR export fulfilment',
    purpose:
      'On Settings → "Download my data" click, gathers the full export packet (profile, aircraft, entries, work-orders, invoices, audit) and emails a signed download link. Bounded to a 7-day URL TTL.',
    category: 'compliance',
    trigger: 'human_button',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: true,
  },
  {
    id: 'compliance.dpa-anniversary-reviewer',
    label: 'DPA anniversary reviewer',
    purpose:
      'Tracks every signed DPA and its 12-month re-review date. 30 / 7 / 0 day notifications. Pulls the live sub-processor list and diffs against the customer\'s last-signed copy.',
    category: 'compliance',
    trigger: 'cron',
    cron_schedule: '0 9 * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },
  {
    id: 'compliance.iso-evidence-collector',
    label: 'ISO 27001 evidence collector',
    purpose:
      'Parallel to the SOC2 packet — collects the annex-A control evidence on a quarterly cadence. Same packaging pipeline.',
    category: 'compliance',
    trigger: 'cron',
    cron_schedule: '0 0 1 */3 *',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: true,
  },

  // ── UX HELP (proposed)
  {
    id: 'ux-help.empty-state-coach',
    label: 'Empty-state coach',
    purpose:
      "On-demand: given a page path + persona, returns 2-3 specific next-action suggestions for users staring at an empty page (no aircraft, no work orders, etc.). Falls back to a heuristic table when OPENAI_API_KEY isn't set so EmptyState always shows something useful.",
    category: 'ux-help',
    trigger: 'human_button',
    status: 'active',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
    reference: 'lib/agents/impl/ux-empty-state-coach.ts',
  },
  {
    id: 'ux-help.error-explainer',
    label: 'Error explainer',
    purpose:
      'When a 5xx or unexpected client error surfaces, rewrites the developer-facing message into a one-sentence user-facing explanation + a "try this" suggestion. Live inline in the error boundary.',
    category: 'ux-help',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },

  // ── WORKFORCE (proposed)
  {
    id: 'workforce.shift-summary-drafter',
    label: 'Shift summary drafter',
    purpose:
      'At end of shift, drafts a 3-sentence summary for each mechanic of what they signed off, what\'s open, and what\'s blocked. Sits in their inbox for sign-off.',
    category: 'workforce',
    trigger: 'cron',
    cron_schedule: '0 17 * * *',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'workforce.return-to-service-checker',
    label: 'Return-to-service checker',
    purpose:
      'Before a mechanic signs RTS on a work order, validates the chain: every open squawk has a resolution, every AD compliance entry has the AD reference, every part change has the part number. Refuses or warns.',
    category: 'workforce',
    trigger: 'human_button',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: false,
    reference: 'SOP-MNT-002 §3',
  },

  // ── SALES + GROWTH (proposed)
  {
    id: 'sales.trial-conversion-coach',
    label: 'Trial conversion coach',
    purpose:
      'At day 7 of a trial, looks at usage (aircraft added? logbook uploaded? mechanic invited?) and drafts a personalised email pointing at the next high-value action.',
    category: 'sales',
    trigger: 'cron',
    cron_schedule: '0 10 * * *',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o',
    writes: false,
  },
  {
    id: 'sales.churn-risk-predictor',
    label: 'Churn-risk predictor',
    purpose:
      'Daily: scores every paying customer 0-100 for churn risk based on login frequency + active aircraft + last upload + ticket sentiment. Top-decile risks get a "founder-call" task.',
    category: 'sales',
    trigger: 'cron',
    cron_schedule: '30 6 * * *',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'sales.review-request-timer',
    label: 'Review request timer',
    purpose:
      'When a customer has used the platform for 30 days, has ≥3 aircraft, and has a green NPS, schedule a Trustpilot review request from their account email.',
    category: 'sales',
    trigger: 'cron',
    cron_schedule: '0 11 * * *',
    status: 'proposed',
    recommended_provider: 'none',
    recommended_model: 'sql-only',
    writes: false,
  },

  // ── RAG (proposed)
  {
    id: 'rag.query-rewriter',
    label: 'Query rewriter',
    purpose:
      'Before a /api/ask call, expand the user question into 2-3 alternative phrasings to improve recall on small KBs. Cheap model — ranking happens via Cohere rerank.',
    category: 'rag',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'rag.context-compressor',
    label: 'Context compressor',
    purpose:
      'When the retrieved context exceeds the model\'s usable window, runs a per-chunk compression pass keeping only sentences with the question\'s key entities.',
    category: 'rag',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
    writes: false,
  },
  {
    id: 'rag.answer-grader',
    label: 'Answer grader',
    purpose:
      'After every /api/ask answer, ask a separate model to grade the answer\'s faithfulness 0-5 against the cited chunks. Anything <3 gets surfaced in /admin/agents.',
    category: 'rag',
    trigger: 'chained',
    status: 'proposed',
    recommended_provider: 'openai',
    recommended_model: 'gpt-4o-mini',
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
