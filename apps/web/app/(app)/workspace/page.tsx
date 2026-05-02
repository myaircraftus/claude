import { redirect } from 'next/navigation'

// The "AI Command Center" surface (/workspace) was retired. Mechanics
// interact with AI through the work-order Activity tab and per-WO AI Plan
// drawer; owners use the Logbook AI (/ask). Anyone landing on /workspace
// gets bounced to the dashboard so we don't leave a stray AI surface
// hanging around.
export default function WorkspaceRedirect() {
  redirect('/dashboard')
}
