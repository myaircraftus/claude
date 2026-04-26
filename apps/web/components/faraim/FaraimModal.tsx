'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, BookOpen, MessagesSquare, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFaraimSession } from './use-faraim-session'

interface FaraimModalProps {
  open: boolean
  onClose: () => void
}

type View = 'ask' | 'questionBank'

export function FaraimModal({ open, onClose }: FaraimModalProps) {
  const [view, setView] = useState<View>('ask')
  const { data, loading, error, upgradeRequired, retry } = useFaraimSession(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const url = data?.embedUrls?.[view] ?? data?.embedUrls?.ask ?? null
  const remaining = data?.access?.remaining ?? null
  const showFreeBanner =
    data?.access?.reason === 'free_quota' && typeof remaining === 'number'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="FAR/AIM AI Search"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-[1100px] h-full sm:h-[90vh] sm:max-h-[900px] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-5 py-3 border-b border-border bg-muted/40">
          <div className="flex flex-col">
            <span className="font-bold text-[15px] text-foreground tracking-tight">FAR/AIM</span>
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              AI-powered FAA regulation search · 14 CFR · AIM · Handbooks
            </span>
          </div>

          <div className="flex-1 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-white p-0.5 text-[12px]">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${
                  view === 'ask'
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setView('ask')}
                aria-pressed={view === 'ask'}
              >
                <MessagesSquare className="h-3.5 w-3.5" /> Ask
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${
                  view === 'questionBank'
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setView('questionBank')}
                aria-pressed={view === 'questionBank'}
              >
                <BookOpen className="h-3.5 w-3.5" /> Question Bank
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close FAR/AIM"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {showFreeBanner && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 flex items-center justify-between gap-3">
            <span>
              Free preview · {remaining} of 10 questions left. Add an aircraft or upgrade to unlock unlimited FAR/AIM.
            </span>
            <Button asChild size="sm" variant="outline" className="h-7 text-[12px]">
              <Link href="/aircraft">Add an aircraft</Link>
            </Button>
          </div>
        )}

        <div className="flex-1 relative bg-white">
          {loading && !data && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[13px]">Loading FAR/AIM…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-[14px] text-foreground max-w-md">{error}</p>
              {upgradeRequired ? (
                <div className="flex gap-2">
                  <Button asChild>
                    <Link href="/aircraft">Add an aircraft</Link>
                  </Button>
                  <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
              ) : (
                <Button onClick={retry} variant="default">Try again</Button>
              )}
            </div>
          )}
          {url && !error && (
            <iframe
              key={url}
              src={url}
              title="FAR/AIM AI Assistant"
              className="w-full h-full border-0 block"
              allow="clipboard-write; microphone"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
      </div>
    </div>
  )
}
