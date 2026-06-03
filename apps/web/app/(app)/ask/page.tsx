'use client'

import { AskExperience } from '@/components/ask/ask-experience'

// Phase 1 — voice input now lives inside the Ask composer (see AskExperience),
// not as a floating mic. The old floating button recorded then *discarded* the
// transcript (it was mounted with no onResult handler) and overlapped the
// global launcher in the bottom-right corner.
export default function AskPage() {
  return <AskExperience />
}
