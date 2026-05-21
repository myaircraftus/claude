/**
 * POST /api/sop/simulator
 *
 * The AI Simulator backend. Runs a scenario-based chat where the AI acts
 * as an aviation maintenance trainer guiding the user through real
 * myaircraft.us workflows.
 *
 * Why it exists: training, QA, sales demos, compliance evidence. A new
 * mechanic learns by doing a simulated annual inspection. A shop owner
 * runs through "owner approval" to see what their customer experiences.
 * An investor watches the AI guide through a workflow as a product demo.
 *
 * The simulator is grounded in:
 *   1. The full SOP corpus (same as /api/sop/ask) — for canonical procedure
 *   2. The selected scenario's success criteria (defined here, server-side)
 *   3. The conversation history
 *
 * Output is plain markdown (no citations panel — the chat UI handles that).
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { listSops } from '@/lib/sop/parser'
import { appendTurn, createSession } from '@/lib/sop/sessions'

export const runtime = 'nodejs'
export const maxDuration = 60

export interface SimulatorScenario {
  id: string
  title: string
  description: string
  persona: 'mechanic' | 'owner' | 'admin'
  successCriteria: string[]
  openingMessage: string
}

export const SCENARIOS: SimulatorScenario[] = [
  {
    id: 'annual-inspection',
    title: 'Annual Inspection',
    description: "An IA performs an annual on a Cessna 172. Walk through every step from opening the WO to signing the logbook.",
    persona: 'mechanic',
    openingMessage:
      "**Scenario: Annual Inspection**\n\nN4421H (Cessna 172) is in your shop for its annual inspection. You're the IA on duty. Walk me through what you'd do in myaircraft.us, step by step. Start with whatever you'd do first.",
    successCriteria: [
      'Opens a work order with service_type=annual_inspection',
      'Generates / loads the annual inspection checklist',
      'Records findings as squawks',
      'Tracks parts used',
      'Clocks in / out for the labor',
      'Writes a logbook entry referencing 14 CFR 43.11 + ATA chapter 05',
      'Signs the logbook entry with IA authorization',
      'Notifies the owner of completion + invoice',
    ],
  },
  {
    id: 'engine-failure-squawk',
    title: 'Engine Failure Squawk',
    description: "A pilot reports rough engine after a flight. Diagnose, fix, log, bill.",
    persona: 'mechanic',
    openingMessage:
      "**Scenario: Engine Failure Squawk**\n\nThe owner of N401LP just landed and reports the engine ran rough on the descent. They taxied straight to your shop. You're the A&P assigned. Walk me through what you'd do.",
    successCriteria: [
      'Records the owner squawk with appropriate severity',
      'Opens a work order linked to the squawk',
      'Records diagnostic findings',
      'Identifies parts needed; checks inventory or orders',
      'Records repair work in logbook entry',
      'References ATA 71 (Powerplant - General) or relevant JASC code',
      'Notifies the owner of estimate before extensive labor',
    ],
  },
  {
    id: 'owner-approval',
    title: 'Owner Approval Flow',
    description: "You're an aircraft owner. An estimate is in your portal for review. Walk through approving + paying.",
    persona: 'owner',
    openingMessage:
      "**Scenario: Owner Estimate Approval**\n\nYou just got an email — your shop sent you an estimate for $4,827.50 for the annual on your aircraft. They've requested a $1,500 deposit. Walk me through what you'd do in your owner portal.",
    successCriteria: [
      'Logs into the owner portal',
      'Navigates to the estimate',
      'Reviews scope of work + line items',
      'Asks any clarifying question via the comment thread (optional)',
      'Approves the estimate',
      'Pays the deposit via Stripe',
      'Sees confirmation + understands what happens next',
    ],
  },
  {
    id: 'ad-compliance',
    title: 'AD Compliance Check',
    description: "An IA verifies a fleet's AD compliance status.",
    persona: 'mechanic',
    openingMessage:
      "**Scenario: AD Compliance Check**\n\nYou're the IA at a shop with 6 customer aircraft. You want to verify which ADs are due across the fleet so you can plan next week. Walk me through what you'd do in myaircraft.us.",
    successCriteria: [
      'Opens the compliance / due-list view',
      'Filters by AD or annual',
      'Reviews per-aircraft status',
      'Cross-references logbook entries for past compliance',
      'Schedules follow-up work via WO or notes',
    ],
  },
  {
    id: 'pre-purchase',
    title: 'Pre-Purchase Inspection',
    description: "Buyer asks the shop to do a pre-purchase on an aircraft they don't yet own.",
    persona: 'mechanic',
    openingMessage:
      "**Scenario: Pre-Purchase Inspection**\n\nA potential buyer is interested in an aircraft currently for sale. They've hired your shop for a pre-purchase inspection. The current owner agrees. Walk me through how you'd set up + run the inspection in myaircraft.us.",
    successCriteria: [
      'Adds the aircraft (or uses a temporary record)',
      'Opens a work order with service_type=pre_purchase',
      'Generates checklist',
      'Records all findings, including non-AOG items',
      'Writes the report — owner-shareable',
      'Manages two-party communication carefully (buyer + seller)',
    ],
  },
  {
    id: 'parts-low-stock',
    title: 'Parts Inventory — Low Stock',
    description: 'A parts specialist responds to a low-stock alert for a critical brake-pad part.',
    persona: 'admin',
    openingMessage:
      "**Scenario: Low-Stock Alert**\n\nThe daily parts cron just flagged that you're down to 1 set of Cessna 172 brake pads (PN 066-08000). Two open WOs may need them this week. Walk me through what you'd do in the Parts module.",
    successCriteria: [
      'Reviews the low-stock alert + threshold settings',
      'Checks open WOs that reference the part',
      'Opens a Purchase Order with the preferred vendor',
      'Records the expected receive date',
      'Notifies affected WO owners of the part-lead-time risk',
      'Considers a temporary substitute or alternate vendor',
    ],
  },
  {
    id: 'owner-disputes-invoice',
    title: 'Owner Disputes an Invoice Line',
    description: "You're a shop admin. An owner questioned a $480 line item on their invoice via the portal.",
    persona: 'admin',
    openingMessage:
      "**Scenario: Owner Invoice Dispute**\n\nAn owner just posted in their portal: \"What's the $480 line on Invoice 2026-0042? I don't remember authorizing that work.\" Walk me through how you'd resolve it inside myaircraft.us.",
    successCriteria: [
      'Opens the invoice in the shop admin view',
      'Reviews the disputed line item + linked WO + mechanic notes',
      'Cross-references the estimate the owner approved',
      'Composes a customer-facing reply (transparent + factual)',
      'Either: adjusts the invoice (with audit) OR confirms the charge is valid + explains',
      'Closes the dispute thread; logs the resolution',
    ],
  },
  {
    id: 'mechanic-finds-ad-during-annual',
    title: 'Annual Reveals a New AD',
    description: 'During an annual inspection, the IA discovers an applicable AD that has not yet been complied with.',
    persona: 'mechanic',
    openingMessage:
      "**Scenario: New AD Discovered**\n\nYou're 75% through an annual on N4421H. You notice an AD applicable to the airframe that the prior shop never addressed. The owner is expecting the plane back in 2 days. Walk me through what you'd do.",
    successCriteria: [
      'Confirms the AD applicability against the aircraft (make/model/serial/year)',
      'Opens a squawk capturing the AD non-compliance',
      'Notifies the owner — clear, factual, no alarm',
      'Issues a change-order to the estimate for the additional work',
      'Sources parts + estimates time impact',
      'Records the AD compliance evidence in the logbook entry when complete',
      'References 14 CFR 39.7 (AD compliance) in the entry',
    ],
  },
  {
    id: 'ia-renewal-due',
    title: 'IA Renewal Window',
    description: "Your IA renewal expires in 60 days. You're catching it early.",
    persona: 'mechanic',
    openingMessage:
      "**Scenario: IA Renewal**\n\nThe platform just notified you that your IA renewal is due in 60 days. You want to handle it before it lapses. Walk me through what you'd do.",
    successCriteria: [
      "Reviews your mechanic profile in /admin/users/[id] (or /settings)",
      'Confirms the rating_ia_renewal_due date is accurate',
      'Schedules + completes the FAA renewal requirement (off-platform)',
      'Returns to the platform; uploads the renewal certificate',
      "Lead reviews + approves; rating_ia_renewal_due updates",
      "Verifies can_sign_annual is still true",
      'Logs the change in mechanic_certificate_history',
    ],
  },
  {
    id: 'onboard-new-mechanic',
    title: 'Onboard a New Mechanic',
    description: 'A lead admin invites a new A&P, verifies certificates, and grants the right scope.',
    persona: 'admin',
    openingMessage:
      "**Scenario: New Mechanic Hire**\n\nYou just hired Maria, a fresh A&P with one year of shop experience. Walk me through how you'd onboard her in myaircraft.us so she can start logging work tomorrow.",
    successCriteria: [
      'Opens /admin/users + sends an invite to Maria',
      'Sets the role to A&P (not IA)',
      'Maria signs up via the invite link, completes her profile',
      'Maria uploads her A&P certificate scan to documents',
      'Lead reviews the certificate + sets rating_ap=true',
      'Verifies can_sign_minor=true, can_sign_annual=false, can_sign_ia=false',
      'Records the certificate in mechanic_certificate_history',
      'Confirms Maria can be assigned to a work order',
    ],
  },
  {
    id: 'logbook-correction',
    title: 'Correct a Signed Logbook Entry',
    description: 'A mistake is found in a signed entry. The mechanic needs to supersede it correctly.',
    persona: 'mechanic',
    openingMessage:
      "**Scenario: Logbook Correction**\n\nYou signed a logbook entry last week for an annual on N9821C. The owner just called — you misspelled the tachometer reading (3,124.5 instead of 3,142.5). You can't just edit a signed entry. Walk me through the correct fix.",
    successCriteria: [
      'Recognizes the signed entry is immutable (cannot edit)',
      'Opens the original entry in /logbook-entries/[id]',
      'Initiates a supersede flow (NOT a delete)',
      'Authors a corrective entry referencing the original by id + date',
      'Records the correct tach reading + a clear correction narrative',
      'IA / authorized A&P signs the corrective entry',
      'Original entry status moves to "Superseded" (visible in the audit trail)',
      'Owner is re-notified of the corrected record',
    ],
  },
  {
    id: 'multi-aircraft-owner',
    title: 'Multi-Aircraft Owner Onboarding',
    description: "An owner with a fleet of 4 aircraft signs up. Walk through how their portal handles all of them.",
    persona: 'owner',
    openingMessage:
      "**Scenario: Fleet Owner Onboarding**\n\nYou own 4 aircraft — a Cessna 172, a King Air, a Cirrus SR22, and a Bonanza. Your shop just invited you to the owner portal. Walk me through what you'd do.",
    successCriteria: [
      'Accepts the invite + creates a portal account',
      'Sees a multi-aircraft picker on the dashboard',
      'Confirms each aircraft is correctly linked to their owner profile',
      'Sets per-aircraft notification preferences (e.g., SR22 = SMS, King Air = email-only)',
      'Reviews documents for each aircraft (read-only)',
      'Submits a question via /owner/threads for the Cirrus only',
      'Pays a deposit on one estimate via Stripe',
      'Verifies the activity feed groups events by aircraft',
    ],
  },
  {
    id: '100-hour-inspection',
    title: '100-Hour Inspection',
    description: 'An A&P (no IA needed) performs a 100-hour inspection on a Part 91 trainer.',
    persona: 'mechanic',
    openingMessage:
      "**Scenario: 100-Hour Inspection**\n\nN201XR is a flight-school trainer due for its 100-hour. You're the A&P — no IA needed for a 100-hour. Walk me through the flow.",
    successCriteria: [
      'Opens a work order with service_type=100_hour',
      'Loads the 100-hour checklist (distinct from the annual checklist)',
      'Verifies prior 100-hour signoffs in the timeline',
      'Records findings; resolves any squawks',
      'Writes a logbook entry referencing 14 CFR 91.409(b) + ATA 05',
      'Signs the entry as A&P (NOT IA)',
      'Releases the aircraft + notifies the school operator',
    ],
  },
  {
    id: 'walkaround-squawk-triage',
    title: 'Walkaround Squawk Triage',
    description: 'During a walkaround, the pilot finds three issues. The mechanic triages and prioritizes them.',
    persona: 'mechanic',
    openingMessage:
      "**Scenario: Walkaround Triage**\n\nA flight school instructor just did a walkaround on N3812L before a lesson. They found: (1) a small oil drip under the cowling, (2) a loose nav-light lens, (3) a worn nosewheel tire. The lesson is in 30 minutes. Walk me through how you'd triage.",
    successCriteria: [
      'Opens the aircraft workspace + Squawks tab',
      'Records each finding as a separate squawk with severity',
      'Classifies each as AOG / Deferable / Cosmetic (or similar)',
      'Identifies the oil drip as AOG (no-go) — grounds the aircraft',
      'Identifies the nav-light as deferable (it\'s a day VFR lesson)',
      'Identifies the tire as scheduled-replacement (book within X hours)',
      'Notifies the instructor + sets aircraft.is_airworthy=false until the oil drip is investigated',
      'Opens a work order linked to the AOG squawk',
    ],
  },
  {
    id: 'marketplace-listing',
    title: 'List an Aircraft on the Marketplace',
    description: 'A shop or owner lists an aircraft for sale via the marketplace. Walks through the listing + buyer flow.',
    persona: 'admin',
    openingMessage:
      "**Scenario: Marketplace Listing**\n\nThe owner of N4421H has decided to sell. They want the listing to include the digital logbook so buyers can verify history. Walk me through how you'd create + publish the listing.",
    successCriteria: [
      'Opens the aircraft + sets marketplace_visible=true (with owner consent)',
      'Reviews which documents will be exposed (records access fee policy)',
      'Composes the listing — make/model/year/hours/asking price',
      'Generates the AI-summary teaser of the maintenance history',
      'Reviews the auto-generated summary; edits if needed',
      'Publishes; verifies the public listing renders correctly at /marketplace/[id]',
      'Configures buyer-thread routing (who handles inbound questions)',
    ],
  },
  {
    id: 'gdpr-data-export',
    title: 'Owner Requests Data Export',
    description: 'An owner exercises their GDPR Article 20 right to export all their personal + aircraft data.',
    persona: 'admin',
    openingMessage:
      "**Scenario: GDPR Data Export**\n\nAn owner emails you: \"Per GDPR I'm requesting a full export of all personal data and aircraft records you hold on me.\" Walk me through how you'd handle this in myaircraft.us.",
    successCriteria: [
      'Verifies the request is from the actual owner (not impersonation)',
      'Locates /api/owner/export (or the /admin export tool)',
      'Initiates the export job — packages owner profile + aircraft + estimates + invoices + logbooks',
      'Excludes other tenants\' data even where the owner is mentioned',
      'Delivers the package via a time-limited signed URL',
      'Records the export in the audit_event log (kind=data_export)',
      'Confirms the owner received the package + closes the request',
    ],
  },
]

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface SimulatorBody {
  scenarioId?: string
  messages?: ChatTurn[]
  /** Optional session id. If absent, a fresh DB row is created (best-effort). */
  sessionId?: string
}

interface SimulatorResponse {
  assistant: string
  scenarioComplete: boolean
  completedCriteria: string[]
}

function getSystemPrompt(scenario: SimulatorScenario, sopExcerpts: string): string {
  return `You are an aviation maintenance trainer using the myaircraft.us platform. Your job is to guide the user through a realistic workflow scenario, asking them what they'd do next and giving them feedback grounded in the platform's actual SOPs and procedures.

**Scenario:** ${scenario.title}
**Description:** ${scenario.description}
**Persona the user is playing:** ${scenario.persona}

**Success criteria — the user must demonstrate these to complete the scenario:**
${scenario.successCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**How to coach:**
- After the user describes a step, give specific, encouraging feedback. Reference the exact route, button, or field in the myaircraft.us UI.
- If the user skips a step, prompt them: "What about X? In a real annual you'd also need to…"
- If the user does something incorrect (e.g., apprentice signing an annual), correct them and cite the SOP rule.
- Keep responses tight — 3-5 short paragraphs max. The conversation should feel like a coach standing next to them, not a textbook.
- Reference SOPs by name when relevant: "Per SOP-07 Logbook Entries, …" or "SOP-12 Owner Portal §6 covers the approval flow."
- Use markdown for clarity: **bold** for actions, *italic* for emphasis, \`code\` for routes and field names, bullet lists for sub-steps.

**When the scenario is complete:**
- When the user has demonstrably hit all success criteria (or close enough), end with a summary, congratulate them, and set scenarioComplete=true in your response.
- Otherwise scenarioComplete=false.

**Reference SOP excerpts (use these to ground your answers — don't invent facts):**

${sopExcerpts}

**Response format — strict JSON:**
{
  "assistant": "your reply in markdown",
  "scenarioComplete": false,
  "completedCriteria": ["criterion-1-name", "criterion-2-name"]
}

completedCriteria should list which of the numbered success criteria the user has demonstrated SO FAR in the conversation. Cumulative — include criteria from earlier turns too.`
}

export async function POST(req: NextRequest) {
  // Auth: any logged-in user can use the simulator (it's training, not
  // tenant data). We call supabase directly so a redirect doesn't fire
  // inside an API route.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })
  }

  let body: SimulatorBody
  try {
    body = (await req.json()) as SimulatorBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const scenarioId = body.scenarioId ?? ''
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  if (!scenario) {
    return NextResponse.json(
      { error: `Unknown scenario id: ${scenarioId}` },
      { status: 400 },
    )
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return NextResponse.json(
      { error: 'messages must contain at least the user opening' },
      { status: 400 },
    )
  }

  // Resolve / create the persistent session row. The first turn (just
  // the opening assistant message + the user's first reply) creates a
  // new row; subsequent turns append to the existing one. Persistence
  // is best-effort — if the DB write fails we still serve the chat.
  let sessionId = body.sessionId ?? null
  if (!sessionId) {
    sessionId = await createSession({
      userId: user.id,
      scenarioId,
      openingMessage: scenario.openingMessage,
    })
  }

  // Load + trim SOP corpus for grounding. Same approach as /api/sop/ask but
  // tighter character cap (we're in a multi-turn chat, total context must
  // include conversation history).
  const sops = await listSops()
  const MAX_CHARS_PER_SOP = 1800
  const sopExcerpts = sops
    .map((s) => {
      const body = s.body.length > MAX_CHARS_PER_SOP ? s.body.slice(0, MAX_CHARS_PER_SOP) + '\n[…]' : s.body
      return `--- SOP: ${s.frontmatter.title} (${s.slug}) ---\n${body}`
    })
    .join('\n\n')

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const chatMessages = [
    { role: 'system' as const, content: getSystemPrompt(scenario, sopExcerpts) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  let parsed: SimulatorResponse
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0.2, // a little warmth for the coaching voice
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: chatMessages,
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    parsed = JSON.parse(raw) as SimulatorResponse
  } catch (err) {
    console.error('[api/sop/simulator] LLM call failed:', err)
    return NextResponse.json(
      { error: 'AI coach failed. Please try again.' },
      { status: 502 },
    )
  }

  const assistant =
    typeof parsed.assistant === 'string' ? parsed.assistant : '(no reply)'
  const scenarioComplete = !!parsed.scenarioComplete
  const completedCriteria = Array.isArray(parsed.completedCriteria)
    ? parsed.completedCriteria
    : []

  // Append the latest (user, assistant) turn pair to the session row.
  // The user's latest message is always the last entry in `messages`.
  const lastUserTurn = messages[messages.length - 1]
  if (sessionId && lastUserTurn && lastUserTurn.role === 'user') {
    await appendTurn({
      sessionId,
      userId: user.id,
      userTurn: { role: 'user', content: lastUserTurn.content, ts: Date.now() },
      assistantTurn: { role: 'assistant', content: assistant, ts: Date.now() },
      completedCriteria,
      scenarioComplete,
    })
  }

  return NextResponse.json({
    sessionId,
    assistant,
    scenarioComplete,
    completedCriteria,
  })
}

export async function GET() {
  // GET returns the list of scenarios — used by the simulator UI to render
  // the picker without bundling SCENARIOS into the client. Also returns
  // the calling user's prior sessions (best-effort) so the client can
  // render a "Resume" rail on the picker.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let recentSessions: Array<{
    id: string
    scenario_id: string
    is_complete: boolean
    completed_criteria: string[]
    started_at: string
    last_message_at: string
  }> = []
  if (user) {
    const { data } = await supabase
      .from('sop_simulator_sessions')
      .select('id, scenario_id, is_complete, completed_criteria, started_at, last_message_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(20)
    if (data) recentSessions = data
  }

  return NextResponse.json({
    scenarios: SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      persona: s.persona,
      openingMessage: s.openingMessage,
      successCriteria: s.successCriteria,
    })),
    recentSessions,
  })
}
