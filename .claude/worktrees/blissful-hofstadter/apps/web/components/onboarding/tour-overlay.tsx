'use client'

import {
  CheckCircle2,
  FileText,
  MessageSquare,
  Plane,
  Receipt,
  Shield,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTour } from './tour-provider'
import { TOUR_STEPS } from './tour-steps'

// Map icon name strings to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  MessageSquare,
  FileText,
  Wrench,
  Receipt,
  Plane,
  Shield,
  CheckCircle2,
}

export function TourOverlay() {
  const { currentStep, totalSteps, nextStep, prevStep, skipTour, goToStep } =
    useTour()
  const [visible, setVisible] = useState(false)

  // Fade-in on mount, fade-out handled via opacity class
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Fade between steps
  const [stepKey, setStepKey] = useState(currentStep)
  const [stepVisible, setStepVisible] = useState(true)

  useEffect(() => {
    setStepVisible(false)
    const t = setTimeout(() => {
      setStepKey(currentStep)
      setStepVisible(true)
    }, 150)
    return () => clearTimeout(t)
  }, [currentStep])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          skipTour()
          break
        case 'ArrowRight':
          nextStep()
          break
        case 'ArrowLeft':
          prevStep()
          break
      }
    },
    [skipTour, nextStep, prevStep],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const step = TOUR_STEPS[stepKey]
  if (!step) return null

  const Icon = ICON_MAP[step.icon] ?? Sparkles
  const isLast = currentStep === totalSteps - 1
  const isFirst = currentStep === 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={skipTour}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Close button */}
        <button
          onClick={skipTour}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Close tour"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress dots */}
        <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-6 bg-brand-500'
                  : i < currentStep
                    ? 'w-1.5 bg-brand-300'
                    : 'w-1.5 bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        {/* Illustration area */}
        <div
          className={`relative flex items-center justify-center h-48 bg-gradient-to-br ${step.bgGradient} dark:from-muted/40 dark:to-muted/20 transition-all duration-150 ${
            stepVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <Icon
            className={`w-20 h-20 ${step.iconColor} drop-shadow-sm`}
            strokeWidth={1.5}
          />
        </div>

        {/* Content */}
        <div
          className={`px-8 pt-6 pb-8 transition-all duration-150 ${
            stepVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          <p className="text-xs font-medium text-muted-foreground mb-1 text-center">
            Step {currentStep + 1} of {totalSteps}
          </p>
          <h2 className="text-[22px] font-bold text-foreground text-center leading-snug mb-3">
            {step.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            {step.description}
          </p>

          {step.ctaHint && (
            <div className="mt-4 flex items-center justify-center">
              <span className="inline-block text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-3 py-1.5 rounded-full border border-brand-200 dark:border-brand-800">
                {step.ctaHint}
              </span>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between gap-4">
            {/* Skip / Prev left side */}
            <div className="flex items-center gap-3">
              <button
                onClick={skipTour}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Skip tour
              </button>
            </div>

            {/* Prev + Next right side */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={prevStep}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Previous
                </button>
              )}
              <button
                onClick={nextStep}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm"
              >
                {isLast ? 'Get Started →' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
