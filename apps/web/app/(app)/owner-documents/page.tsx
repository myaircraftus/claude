// Owner documents are served by the shared, persona-scoped /documents page
// (lib/documents/persona-scope) — owner persona there shows the full
// aircraft-records lockbox. This route is kept only so old links/bookmarks
// resolve; it redirects to the canonical /documents page.
import { redirect } from 'next/navigation'

export default function OwnerDocumentsPage() {
  redirect('/documents')
}
