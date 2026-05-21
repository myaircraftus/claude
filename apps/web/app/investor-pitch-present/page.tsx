import { PresenterClient } from './presenter-client'

export const dynamic = 'force-dynamic'

export default function PresenterPage({
  searchParams,
}: {
  searchParams?: { from?: string }
}) {
  const startN = Math.max(1, parseInt(searchParams?.from ?? '1', 10) || 1)
  return <PresenterClient startN={startN} />
}
