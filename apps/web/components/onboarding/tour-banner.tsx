'use client'

import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useTour } from './tour-provider'

const COMPLETED_KEY = 'myaircraft_tour_completed'
const DISMISSED_KEY = 'myaircraft_tour_dismissed'

export function TourBanner() {
  const { startTour } = useTour()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(COMPLETED_KEY)
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (!completed && !dismissed) {
      setVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setVisible(false)
  }

  const handleStartTour = () => {
    setVisible(false)
    startTour()
  }

  if (!visible) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 text-sm font-medium shadow-sm"
      style={{ backgroundColor: '#FEF3C7', borderBottom: '1px solid #FCD34D', color: '#78350F' }}
      role="banner"
    >
      <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#D97706' }} />

      <span className="flex-1">
        New here? Take a 2-minute product tour and see exactly how MyAircraft.us works.
      </span>

      <button
        onClick={handleStartTour}
        className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition-all hover:brightness-105 active:scale-95"
        style={{ backgroundColor: '#F59E0B', color: '#0F1E35' }}
      >
        Take the Tour →
      </button>

      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded-md hover:bg-yellow-200 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="w-4 h-4" style={{ color: '#92400E' }} />
      </button>
    </div>
  )
}
