/**
 * Redirect helper — the real presenter view lives at /investor-pitch-present
 * so it can render without the sidebar shell. This server file just
 * forwards any direct hits to /investor-room/pitch/present so older
 * "Present" links keep working.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function PresentBridge({
  searchParams,
}: {
  searchParams?: { from?: string }
}) {
  const from = searchParams?.from ?? '1'
  redirect(`/investor-pitch-present?from=${encodeURIComponent(from)}`)
}
