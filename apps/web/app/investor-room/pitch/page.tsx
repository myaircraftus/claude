/**
 * Pitch deck — scrolling grid view + a prominent "Present" button that
 * opens the full-screen presenter view in a new tab.
 *
 * Why a new tab: opening in the same tab means the back button takes
 * the user to wherever they were before, which is usually not what they
 * want during a real presentation. Opening in a new tab also lets the
 * presenter view request fullscreen without breaking the back-button
 * affordance on the index page.
 */
import { PitchDeckClient } from './pitch-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pitch deck | Investor Room' }

export default function PitchPage() {
  return <PitchDeckClient />
}
