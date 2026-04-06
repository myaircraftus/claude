'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { TOUR_STEPS } from './tour-steps'

const TOUR_COMPLETED_KEY = 'tour_completed'

interface TourContextValue {
  isTourActive: boolean
  currentStep: number
  totalSteps: number
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  goToStep: (n: number) => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return ctx
}

async function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, '1')
    await fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_completed: true }),
    })
  } catch {
    // Best-effort — don't crash the tour if the API call fails
  }
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [isTourActive, setIsTourActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const totalSteps = TOUR_STEPS.length

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsTourActive(true)
  }, [])

  const skipTour = useCallback(() => {
    setIsTourActive(false)
    markTourCompleted()
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1
      if (next >= totalSteps) {
        setIsTourActive(false)
        markTourCompleted()
        return prev
      }
      return next
    })
  }, [totalSteps])

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1))
  }, [])

  const goToStep = useCallback(
    (n: number) => {
      if (n >= 0 && n < totalSteps) {
        setCurrentStep(n)
      }
    },
    [totalSteps],
  )

  // Lazy import of TourOverlay to avoid circular dependency at module level
  const [TourOverlay, setTourOverlay] = useState<React.ComponentType | null>(
    null,
  )

  useEffect(() => {
    import('./tour-overlay').then((mod) => {
      setTourOverlay(() => mod.TourOverlay)
    })
  }, [])

  const value: TourContextValue = {
    isTourActive,
    currentStep,
    totalSteps,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    goToStep,
  }

  return (
    <TourContext.Provider value={value}>
      {children}
      {isTourActive && TourOverlay && <TourOverlay />}
    </TourContext.Provider>
  )
}
