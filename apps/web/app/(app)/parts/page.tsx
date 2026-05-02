import { redirect } from 'next/navigation'

// Parts UX is split:
//   /parts/library   — saved-parts inventory (mechanic role)
//   /mechanic?tab=parts — parts ordering inside the mechanic portal
// /parts (root) defaults to the library view.
export default function PartsPage() {
  redirect('/parts/library')
}
