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
import { requireAppServerSession } from '@/lib/auth/server-app'
import { listSops } from '@/lib/sop/parser'

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
]

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface SimulatorBody {
  scenarioId?: string
  messages?: ChatTurn[]
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
  try {
    await requireAppServerSession()
  } catch {
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

  return NextResponse.json({
    assistant: typeof parsed.assistant === 'string' ? parsed.assistant : '(no reply)',
    scenarioComplete: !!parsed.scenarioComplete,
    completedCriteria: Array.isArray(parsed.completedCriteria) ? parsed.completedCriteria : [],
  })
}

export async function GET() {
  // GET returns the list of scenarios — used by the simulator UI to render
  // the picker without bundling SCENARIOS into the client.
  return NextResponse.json({
    scenarios: SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      persona: s.persona,
      openingMessage: s.openingMessage,
      successCriteria: s.successCriteria,
    })),
  })
}
