'use client'

import { AskExperience } from '@/components/ask/ask-experience'
import { VoiceButton } from '@/components/voice/VoiceButton'

export default function AskPage() {
  return (
    <>
      <AskExperience />
      {/* Spec polish.voice-camera-rollout — voice input on the AI surface.
          Floating bottom-right; z-40 sits above content but below modals. */}
      <div className="fixed bottom-4 right-4 z-40 pointer-events-auto">
        <VoiceButton />
      </div>
    </>
  )
}
