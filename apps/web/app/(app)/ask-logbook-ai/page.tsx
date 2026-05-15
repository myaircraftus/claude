// OWNER PERMISSIONS: Read-only. Ask questions about logbook history and
// aircraft records. Cannot create or edit logbook entries.
//
// Wired 2026-05-15 (PART 2, Case A): an AI assistant surface already
// exists at /ask — app/(app)/ask/page.tsx renders <AskExperience /> (the
// aircraft-aware AI command experience backed by /api/ask). Rather than
// duplicate it, the "Ask Logbook AI" nav item re-exports that page so
// both routes share one implementation.
import AskPage from '../ask/page'

export default AskPage
