import { CustomerApprovalView } from '@/components/approvals/customer-approval-view'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'Approval request',
  // Don't index public approval links — they're tokenized share links.
  robots: { index: false, follow: false },
}

/**
 * Public customer approval page (Spec 1.5).
 *
 * Lives outside the (app) route group, so no auth is required. The
 * `token` URL param is the only credential — the public API
 * (/api/public/approvals/[token]) uses createServiceSupabase() server-
 * side and validates the token explicitly.
 *
 * Loads its own minimal shell (no sidebar, no app chrome) so customers
 * see a focused, brand-light approval experience.
 */
export default function PublicApprovalPage({
  params,
}: {
  params: { token: string }
}) {
  return (
    <>
      <CustomerApprovalView token={params.token} />
      <Toaster position="top-right" richColors closeButton />
    </>
  )
}
