'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTour } from './tour-provider'

interface TooltipPosition {
  top: number
  left: number
  transformOrigin: string
}

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 12 // px around spotlight target

function getTooltipPosition(
  targetRect: DOMRect | null,
  position: 'top' | 'bottom' | 'left' | 'right',
  tooltipWidth = 340,
  tooltipHeight = 200,
): TooltipPosition {
  if (!targetRect) {
    // Fallback: center of screen
    return {
      top: window.innerHeight / 2 - tooltipHeight / 2,
      left: window.innerWidth / 2 - tooltipWidth / 2,
      transformOrigin: 'center center',
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 16

  let top = 0
  let left = 0
  let transformOrigin = 'top left'

  switch (position) {
    case 'right':
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      left = targetRect.right + gap
      transformOrigin = 'left center'
      break
    case 'left':
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      left = targetRect.left - tooltipWidth - gap
      transformOrigin = 'right center'
      break
    case 'bottom':
      top = targetRect.bottom + gap
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      transformOrigin = 'top center'
      break
    case 'top':
      top = targetRect.top - tooltipHeight - gap
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      transformOrigin = 'bottom center'
      break
  }

  // Clamp to viewport
  left = Math.max(gap, Math.min(left, vw - tooltipWidth - gap))
  top = Math.max(gap, Math.min(top, vh - tooltipHeight - gap))

  return { top, left, transformOrigin }
}

export function ProductTour() {
  const { isActive, currentStep, steps, nextStep, prevStep, endTour, skipTour } = useTour()
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: 0, left: 0, transformOrigin: 'top left' })
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)

  const step = steps[currentStep]

  const updatePositions = useCallback(() => {
    if (!step) return

    const target = document.querySelector(step.target)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    // Small delay to allow scroll to settle
    setTimeout(() => {
      const el = document.querySelector(step.target)
      const rect = el?.getBoundingClientRect() ?? null

      if (rect) {
        setSpotlight({
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
        })
        setTooltipPos(getTooltipPosition(rect, step.position, 340, 220))
      } else {
        setSpotlight(null)
        setTooltipPos(getTooltipPosition(null, step.position, 340, 220))
      }
    }, 120)
  }, [step])

  useEffect(() => {
    if (!isActive) return
    updatePositions()
    window.addEventListener('resize', updatePositions)
    return () => window.removeEventListener('resize', updatePositions)
  }, [isActive, updatePositions])

  // Keyboard support
  useEffect(() => {
    if (!isActive) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep()
      else if (e.key === 'ArrowLeft') prevStep()
      else if (e.key === 'Escape') skipTour()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isActive, nextStep, prevStep, skipTour])

  const isLastStep = currentStep === steps.length - 1

  return (
    <AnimatePresence>
      {isActive && step && (
        <>
          {/* Full-screen overlay with spotlight cutout via SVG clip */}
          <motion.div
            key="tour-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 pointer-events-auto"
            onClick={skipTour}
          >
            {spotlight ? (
              <svg
                className="absolute inset-0 w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <mask id="tour-spotlight-mask">
                    {/* White = visible (dark overlay), black = cut out (spotlight) */}
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={spotlight.left}
                      y={spotlight.top}
                      width={spotlight.width}
                      height={spotlight.height}
                      rx={8}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0,0,0,0.55)"
                  mask="url(#tour-spotlight-mask)"
                />
                {/* Highlight ring around spotlight */}
                <rect
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx={8}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  opacity="0.7"
                />
              </svg>
            ) : (
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
            )}
          </motion.div>

          {/* Tooltip card */}
          <motion.div
            key={`tour-card-${currentStep}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed z-50 pointer-events-auto"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              width: 340,
              transformOrigin: tooltipPos.transformOrigin,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="rounded-xl overflow-hidden shadow-2xl border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {/* Card header */}
              <div className="px-5 py-4" style={{ backgroundColor: '#0F1E35' }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#F59E0B' }}>
                    Step {currentStep + 1} of {steps.length}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{step.title}</h3>
              </div>

              {/* Card body */}
              <div className="px-5 py-4 bg-white">
                <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>

                {/* Progress dots */}
                <div className="flex items-center gap-1.5 mt-4">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === currentStep ? 20 : 6,
                        height: 6,
                        backgroundColor: i === currentStep ? '#F59E0B' : i < currentStep ? '#0F1E35' : '#d1d5db',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Card footer */}
              <div
                className="px-5 py-3 flex items-center justify-between border-t"
                style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb' }}
              >
                <button
                  onClick={skipTour}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Skip tour
                </button>

                <div className="flex items-center gap-2">
                  {currentStep > 0 && (
                    <button
                      onClick={prevStep}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      ← Back
                    </button>
                  )}
                  {isLastStep ? (
                    <button
                      onClick={endTour}
                      className="px-4 py-1.5 rounded-md text-xs font-semibold text-white transition-all hover:brightness-110"
                      style={{ backgroundColor: '#0F1E35' }}
                    >
                      ✓ Done!
                    </button>
                  ) : (
                    <button
                      onClick={nextStep}
                      className="px-4 py-1.5 rounded-md text-xs font-semibold text-white transition-all hover:brightness-110"
                      style={{ backgroundColor: '#F59E0B', color: '#0F1E35' }}
                    >
                      Next →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
