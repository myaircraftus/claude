import { redirect } from 'next/navigation'

// The /library route has been consolidated into /marketplace.
// Permanently redirect visitors (including ?tab=upload links) to the marketplace upload tab.
export default function LibraryRedirect({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const tab = searchParams?.tab === 'upload' ? '?tab=upload' : ''
  redirect(`/marketplace${tab}`)
}
