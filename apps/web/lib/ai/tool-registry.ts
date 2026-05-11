/**
 * AI Tools registry (Spec 0.3).
 *
 * Every tool is a typed function the LLM (or a rule, or a user click) can
 * invoke. This is the *new* registry for the Spec 0.3 orchestrator and is
 * distinct from `lib/ai/tools.ts` (which holds the older OpenAI
 * function-calling schema used by /api/ask).
 *
 * Most tools listed in Spec 0.3 §"Available tools" wrap existing API routes.
 * Calling them through this registry gives us:
 *   - Permission checks per persona
 *   - JSON-schema params for LLM function-calling
 *   - A single audit point for "what did the AI do?"
 *
 * Most handlers are TODOs in this sprint — Spec 0.3 says "backend required,
 * mark TODO clearly". The registry shape and dispatch are wired here; later
 * sprints (1.x compliance, 2.x parts, 5.x AI) fill the handlers in.
 */

import type { AITool, AIContext } from './types'

const REGISTRY = new Map<string, AITool>()

function register(tool: AITool) {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`Duplicate AI tool registration: ${tool.name}`)
  }
  REGISTRY.set(tool.name, tool)
}

/* ─── Tool definitions (handlers stubbed; see TODO per tool) ─────────── */

register({
  name: 'createWorkOrder',
  description: 'Build a work order from natural language describing the maintenance scope.',
  paramsSchema: {
    type: 'object',
    properties: {
      aircraft_id: { type: 'string' },
      summary:     { type: 'string', description: 'Plain-English description of the work.' },
      priority:    { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    },
    required: ['aircraft_id', 'summary'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 2.x): proxy to /api/work-orders POST after Phase 2 line-item shape lands.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — wire to /api/work-orders' }),
})

register({
  name: 'addMeterReading',
  description: 'Log a Hobbs / tach / cycles reading for an aircraft.',
  paramsSchema: {
    type: 'object',
    properties: {
      aircraft_id: { type: 'string' },
      hobbs:       { type: 'number' },
      tach:        { type: 'number' },
      cycles:      { type: 'number' },
      source:      { type: 'string', enum: ['manual', 'airbly', 'fsp', 'adsb'] },
    },
    required: ['aircraft_id'],
  },
  permissions: ['owner', 'shop'],
  // TODO(0.3 → 1.1): wire to the meter_readings table once Feature 1.1 ships.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 1.1 Meter Profiles' }),
})

register({
  name: 'searchParts',
  description: 'Find parts in the org inventory or external part catalogs.',
  paramsSchema: {
    type: 'object',
    properties: {
      query:            { type: 'string' },
      aircraft_id:      { type: 'string' },
      include_external: { type: 'boolean', default: true },
    },
    required: ['query'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 2.1): wrap /api/parts/search.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — wrap /api/parts/search' }),
})

register({
  name: 'addPartToWorkOrder',
  description: 'Append a part line item to an existing work order.',
  paramsSchema: {
    type: 'object',
    properties: {
      work_order_id: { type: 'string' },
      part_id:       { type: 'string' },
      quantity:      { type: 'number', minimum: 1 },
      unit_cost:     { type: 'number' },
    },
    required: ['work_order_id', 'part_id', 'quantity'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 2.1): wrap /api/work-orders/[id]/lines POST.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub' }),
})

register({
  name: 'createInspection',
  description: 'Spin up an inspection from a saved procedure or checklist.',
  paramsSchema: {
    type: 'object',
    properties: {
      aircraft_id:  { type: 'string' },
      procedure_id: { type: 'string' },
      due_date:     { type: 'string', format: 'date' },
    },
    required: ['aircraft_id', 'procedure_id'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 1.3): wire to /api/inspections POST when Feature 1.3 ships.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 1.3 Inspections' }),
})

register({
  name: 'signLogbookEntry',
  description: 'Generate (and request signature for) a logbook entry from a closed work order.',
  paramsSchema: {
    type: 'object',
    properties: { work_order_id: { type: 'string' } },
    required: ['work_order_id'],
  },
  permissions: ['shop'],
  // TODO(0.3): wrap /api/ai/generate-logbook + /api/logbook-entries/[id]/sign.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — wrap existing logbook endpoints' }),
})

register({
  name: 'markComplianceComplete',
  description: 'Close a compliance item (annual, AD, SB) with a reference to the WO that did it.',
  paramsSchema: {
    type: 'object',
    properties: {
      compliance_item_id: { type: 'string' },
      work_order_id:      { type: 'string' },
      notes:              { type: 'string' },
    },
    required: ['compliance_item_id'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 1.2): wire to /api/compliance/[id]/close after Feature 1.2.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 1.2 Compliance' }),
})

register({
  name: 'sendApprovalRequest',
  description: 'Email the customer a link asking them to approve scope, parts, or pricing.',
  paramsSchema: {
    type: 'object',
    properties: {
      customer_id:   { type: 'string' },
      work_order_id: { type: 'string' },
      approval_kind: { type: 'string', enum: ['scope', 'parts', 'pricing', 'invoice'] },
    },
    required: ['customer_id', 'work_order_id', 'approval_kind'],
  },
  permissions: ['shop'],
  // TODO(0.3 → 1.5): wrap /api/owner/approvals POST when Feature 1.5 ships.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 1.5 Approvals' }),
})

register({
  name: 'getAircraftStatus',
  description: 'Read all current state (times, open WOs, compliance, squawks) for one tail.',
  paramsSchema: {
    type: 'object',
    properties: { aircraft_id: { type: 'string' } },
    required: ['aircraft_id'],
  },
  permissions: ['owner', 'shop'],
  // TODO(0.3): aggregate read across aircraft + work_orders + compliance.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — read aggregator' }),
})

register({
  name: 'predictNextDue',
  description: 'ML prediction: when will compliance item X be due based on flight rate.',
  paramsSchema: {
    type: 'object',
    properties: {
      aircraft_id:        { type: 'string' },
      compliance_item_id: { type: 'string' },
    },
    required: ['aircraft_id', 'compliance_item_id'],
  },
  permissions: ['owner', 'shop'],
  // TODO(0.3 → 5.3): linear extrapolation v0; ML model later.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 5.3 Predictive Maintenance ML' }),
})

register({
  name: 'analyzeCompressionTrend',
  description: 'ML analysis on cylinder compression readings to flag declining cylinders.',
  paramsSchema: {
    type: 'object',
    properties: { aircraft_id: { type: 'string' } },
    required: ['aircraft_id'],
  },
  permissions: ['owner', 'shop'],
  // TODO(0.3 → 5.3): pending compression-tracking schema + ML model.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — pending Feature 5.3' }),
})

register({
  name: 'summarizeMaintenanceHistory',
  description: 'LLM summary of maintenance activity for an aircraft over a given period.',
  paramsSchema: {
    type: 'object',
    properties: {
      aircraft_id: { type: 'string' },
      since:       { type: 'string', format: 'date' },
      until:       { type: 'string', format: 'date' },
    },
    required: ['aircraft_id'],
  },
  permissions: ['owner', 'shop'],
  // TODO(0.3): pull from logbook_entries + work_orders, run through Anthropic.
  handler: async (_args, _ctx) => ({ ok: false, todo: 'Tool handler stub — wrap existing /api/ai infrastructure' }),
})

/* ─── Dispatch ────────────────────────────────────────────────────────── */

export function getTool(name: string): AITool | null {
  return REGISTRY.get(name) ?? null
}

export function listTools(): AITool[] {
  return Array.from(REGISTRY.values())
}

/**
 * Invoke a tool by name. Performs permission check against the calling
 * persona before dispatching to the handler. Throws on permission denial
 * or unknown tool — handlers swallow their own errors per their contract.
 */
export async function invokeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AIContext,
): Promise<unknown> {
  const tool = REGISTRY.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  if (!tool.permissions.includes(ctx.persona)) {
    throw new Error(`Persona '${ctx.persona}' is not permitted to invoke '${name}'`)
  }
  return tool.handler(args, ctx)
}
