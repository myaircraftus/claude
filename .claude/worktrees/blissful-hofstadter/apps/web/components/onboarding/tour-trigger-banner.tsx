'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTour } from './tour-provider'

const TOUR_COMPLETED_KEY = 'tour_completed'
const TOUR_DISMISSED_KEY = 'tour_dismissed'

export function TourTriggerBanner() {
  const { startTour } = useTour()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show banner only if tour not completed and not dismissed
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY)
    const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY)
    if (!completed && !dismissed) {
      setVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(TOUR_DISMISSED_KEY, '1')
    setVisible(false)
  }

  const handleStartTour = () => {
    setVisible(false)
    startTour()
  }

  if (!visible) return null

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-brand-50 dark:bg-brand-950/30 border-b border-brand-200 dark:border-brand-800 text-sm">
      <span className="text-lg leading-none" aria-hidden="true">
        👋
      </span>
      <p className="flex-1 text-brand-800 dark:text-brand-200">
        New here? Take a 2-minute tour to see what myaircraft.us can do.
      </p>
      <button
        onClick={handleStartTour}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors shadow-sm"
      >
        Start Tour →
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="shrink-0 p-1 rounded-md text-brand-500 hover:text-brand-700 hover:bg-brand-100 dark:hover:bg-brand-900 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
