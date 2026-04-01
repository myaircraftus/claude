'use client'
import { useState, useEffect } from 'react'
import { Rocket, X } from 'lucide-react'

export function DashboardTourWrapper() {
  const [showBanner, setShowBanner] = useState(false)
  const [showFoundersNote, setShowFoundersNote] = useState(false)

  useEffect(() => {
    const tourDone = localStorage.getItem('myaircraft_tour_completed')
    const tourDismissed = localStorage.getItem('myaircraft_tour_dismissed')
    if (!tourDone && !tourDismissed) setShowBanner(true)

    const foundersDismissed = localStorage.getItem('myaircraft_founders_note_dismissed')
    if (!foundersDismissed) setShowFoundersNote(true)
  }, [])

  const dismissBanner = () => {
    localStorage.setItem('myaircraft_tour_dismissed', 'true')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="mb-6 flex items-center gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="flex items-center gap-2 text-amber-800">
        <Rocket className="w-4 h-4" />
        <span className="text-sm font-medium">New here? Take a 2-minute tour and see exactly how MyAircraft.us works.</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <a
          href="/demo"
          target="_blank"
          className="text-sm font-semibold text-amber-700 hover:text-amber-900 underline"
        >
          Take the Tour →
        </a>
        <button onClick={dismissBanner} className="text-amber-500 hover:text-amber-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
