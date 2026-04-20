'use client'

import React from 'react'
import { FileText } from 'lucide-react'

interface DocumentViewerBoundaryProps {
  children: React.ReactNode
  resetKey?: string | null
}

interface DocumentViewerBoundaryState {
  hasError: boolean
}

export class DocumentViewerBoundary extends React.Component<
  DocumentViewerBoundaryProps,
  DocumentViewerBoundaryState
> {
  state: DocumentViewerBoundaryState = { hasError: false }

  static getDerivedStateFromError(): DocumentViewerBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ask/document-viewer] preview crashed', error)
  }

  componentDidUpdate(prevProps: DocumentViewerBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
          <FileText className="h-12 w-12 text-muted-foreground/30" />
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">Source preview unavailable</p>
            <p className="text-xs text-muted-foreground">
              The answer and citations still work. Re-open the citation to try again.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
