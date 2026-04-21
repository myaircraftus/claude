/**
 * AI tool definitions for the /api/ask command center.
 * Used with OpenAI function calling to let the AI invoke real app actions.
 */

export const AI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_logbook_entry',
      description: 'Draft a maintenance logbook entry for the mechanic to review and sign. Use when the user asks to create, generate, or draft a logbook entry.',
      parameters: {
        type: 'object',
        properties: {
          aircraft_id: { type: 'string', description: 'UUID of the aircraft' },
          entry_type: {
            type: 'string',
            enum: ['100hr', 'annual', 'oil_change', 'ad_compliance', 'repair', 'maintenance', 'discrepancy', 'sb_compliance', 'component_replacement', 'return_to_service', 'major_repair', 'major_alteration', 'owner_preventive'],
          },
          description: { type: 'string', description: 'Plain-language description of the work done' },
        },
        required: ['aircraft_id', 'description'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_parts',
      description: 'Search the parts catalog / marketplace for a specific part for an aircraft. Use when user asks to find, search, or look up parts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Part description, part number, or keyword' },
          aircraft_id: { type: 'string', description: 'UUID of the aircraft for context' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_logbook',
      description: 'Search logbook entries for an aircraft. Use when user asks to find or look up past logbook entries, maintenance history, or repair records.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword (e.g. magneto, annual, oil change)' },
          aircraft_id: { type: 'string', description: 'UUID of the aircraft' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_documents',
      description: 'Semantic search over uploaded aircraft documents (logbooks, POH, manuals, ADs, SBs). Use for Q&A about aircraft records.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The question or search text' },
          aircraft_id: { type: 'string', description: 'UUID of the aircraft (optional — omit to search all aircraft)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_checklist',
      description: 'Generate a work order / inspection checklist. Use when user asks to create a checklist for an annual, 100hr, AD, or other maintenance task.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['annual', '100hr', 'AD', 'SB', 'custom'],
            description: 'Type of checklist',
          },
          aircraft_id: { type: 'string', description: 'UUID of the aircraft' },
          reference: { type: 'string', description: 'AD or SB reference number if scope is AD or SB' },
          prompt: { type: 'string', description: 'Free-text description if scope is custom' },
        },
        required: ['scope'],
      },
    },
  },
] as const

export type AiToolName =
  | 'create_logbook_entry'
  | 'search_parts'
  | 'search_logbook'
  | 'search_documents'
  | 'generate_checklist'
