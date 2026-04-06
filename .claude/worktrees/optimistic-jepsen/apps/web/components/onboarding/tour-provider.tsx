'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type TourStep = {
  id: string
  title: string
  description: string
  target: string // CSS selector
  position: 'top' | 'bottom' | 'left' | 'right'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'chat',
    title: 'Chat-First Interface',
    description:
      'Type anything in plain English — "prepare a logbook entry", "generate a work order", "find alternator for this aircraft". The AI handles the rest.',
    target: '[data-tour="chat"]',
    position: 'right',
  },
  {
    id: 'aircraft',
    title: 'Your Aircraft Fleet',
    description:
      'All your aircraft in one place. Click any aircraft to make it the active context — every chat, entry, and record will be scoped to it.',
    target: '[data-tour="aircraft"]',
    position: 'right',
  },
  {
    id: 'documents',
    title: 'Document Library',
    description:
      'Upload logbooks, POHs, maintenance manuals, ADs, and more. The AI reads and indexes everything so you can ask questions about your exact records.',
    target: '[data-tour="documents"]',
    position: 'right',
  },
  {
    id: 'ask',
    title: 'Ask AI Anything',
    description:
      'Ask questions about your records in plain English. Get answers with exact page citations — from your documents, not the internet. No hallucinations.',
    target: '[data-tour="ask"]',
    position: 'right',
  },
  {
    id: 'maintenance',
    title: 'Maintenance Entries',
    description:
      'Generate FAA-compliant maintenance entries from plain English. The system knows your aircraft, asks only for what it needs, and produces professional output.',
    target: '[data-tour="maintenance"]',
    position: 'right',
  },
  {
    id: 'reminders',
    title: 'Smart Reminders',
    description:
      'Annual, 100-hour, transponder, ELT — automatically tracked. The system alerts you before anything comes due, not after.',
    target: '[data-tour="reminders"]',
    position: 'right',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description:
      'Connect Flight Schedule Pro, Flight Circle, and other platforms to sync hours automatically and keep reminders accurate.',
    target: '[data-tour="integrations"]',
    position: 'right',
  },
  {
    id: 'upload',
    title: 'Upload & Go',
    description:
      'Drag, drop, done. The AI reads your documents and makes them searchable instantly. Scanned logbooks, handwritten notes — all handled.',
    target: '[data-tour="upload"]',
    position: 'bottom',
  },
]

interface TourContextType {
  isActive: boolean
  currentStep: number
  steps: TourStep[]
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  endTour: () => void
  skipTour: () => void
}

export const TourContext = createContext<TourContextType | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const endTour = useCallback(() => {
    setIsActive(false)
    localStorage.setItem('myaircraft_tour_completed', 'true')
  }, [])

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
    localStorage.removeItem('myaircraft_tour_completed')
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep(s => {
      if (s < TOUR_STEPS.length - 1) return s + 1
      // Last step — end tour
      endTour()
      return s
    })
  }, [endTour])

  const prevStep = useCallback(() => {
    setCurrentStep(s => (s > 0 ? s - 1 : 0))
  }, [])

  const skipTour = useCallback(() => {
    setIsActive(false)
    localStorage.setItem('myaircraft_tour_completed', 'skipped')
  }, [])

  return (
    <TourContext.Provider
      value={{ isActive, currentStep, steps: TOUR_STEPS, startTour, nextStep, prevStep, endTour, skipTour }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}
