'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AskError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ask] route error', error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          The AI Command Center hit an unexpected error. Try again, or refresh the page.
        </p>
        <Button onClick={reset} variant="default">Try again</Button>
      </div>
    </div>
  )
}
