import { SimulatorClient } from './simulator-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Simulator | SOP Library',
}

/**
 * AI Simulator entry page.
 *
 * A scenario-based chat where the AI plays "training coach," walking the
 * user through canonical myaircraft.us workflows. Useful for:
 *   - Training new mechanics ("here's how an annual flows in the platform")
 *   - QA validation ("does this workflow match what the SOP says?")
 *   - Sales demos ("watch the AI explain how owner approval works")
 *   - Compliance evidence ("every staff member completed the AD scenario")
 *
 * Scenarios are defined server-side in /api/sop/simulator (SCENARIOS const).
 * The client fetches them on mount and renders the picker.
 */
export default function SimulatorPage() {
  return <SimulatorClient />
}
