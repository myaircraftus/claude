'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: false, // Handled by PostHogPageview
    capture_pageleave: true,
  })
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}

// Aviation-specific event tracking
export const track = {
  documentUploaded: (props: { doc_type: string; file_size: number; org_plan: string }) =>
    posthog.capture('document_uploaded', props),

  documentProcessingCompleted: (props: { duration_ms: number; page_count: number; ocr_required: boolean }) =>
    posthog.capture('document_processing_completed', props),

  questionAsked: (props: { aircraft_id?: string; confidence_result: string }) =>
    posthog.capture('question_asked', props),

  citationClicked: (props: { document_type: string; page_number: number }) =>
    posthog.capture('citation_clicked', props),

  insufficientEvidenceShown: () =>
    posthog.capture('insufficient_evidence_shown'),

  googleDriveConnected: () =>
    posthog.capture('google_drive_connected'),

  subscriptionUpgraded: (props: { from_plan: string; to_plan: string }) =>
    posthog.capture('subscription_upgraded', props),
}
