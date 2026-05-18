import type { ReactNode } from 'react'

/**
 * Shared props for every empty-state component in this directory.
 * All components are pure presentational — server-component-safe
 * (no hooks, no state, no event handlers).
 */
export interface EmptyStateProps {
  /** Headline text. Each component provides a sensible default. */
  headline?: string
  /** Supporting subtext. Each component provides a sensible default. */
  subtext?: string
  /** Optional CTA element rendered below the text. */
  cta?: ReactNode
  /** Extra class names applied to the outer container. */
  className?: string
}

/** Brand palette — the only colors used by empty-state illustrations. */
export const emptyStateColors = {
  navy: '#1B2B5E',
  blue: '#2563EB',
  lightBlue: '#DBEAFE',
  white: '#FFFFFF',
  gray: '#64748B',
  lightGray: '#F1F5F9',
  border: '#E2E8F0',
} as const

interface EmptyStateShellProps {
  illustration: ReactNode
  headline: string
  subtext: string
  cta?: ReactNode
  className?: string
}

/**
 * Layout primitive used by every empty-state component: centers an inline
 * SVG illustration above a headline, subtext and an optional CTA slot.
 */
export function EmptyStateShell({
  illustration,
  headline,
  subtext,
  cta,
  className,
}: EmptyStateShellProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '32px 24px',
        maxWidth: 420,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <div style={{ width: 240, height: 180 }} aria-hidden="true">
        {illustration}
      </div>
      <p
        style={{
          margin: '20px 0 0',
          fontSize: 16,
          fontWeight: 600,
          color: emptyStateColors.navy,
          lineHeight: 1.35,
        }}
      >
        {headline}
      </p>
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 13,
          color: emptyStateColors.gray,
          lineHeight: 1.5,
          maxWidth: 320,
        }}
      >
        {subtext}
      </p>
      {cta ? <div style={{ marginTop: 16 }}>{cta}</div> : null}
    </div>
  )
}
