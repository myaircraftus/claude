import { redirect } from 'next/navigation'

// Operations Dashboard moved to /workflow as a top-level route.
// /dashboard/ops kept as a redirect for any saved bookmarks.
export default function OpsDashboardRedirect() {
  redirect('/workflow')
}
