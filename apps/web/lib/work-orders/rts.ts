/**
 * Shared types/helpers for the return-to-service (RTS) preflight check.
 *
 * The GET /api/work-orders/[id]/rts-check endpoint returns blockers and
 * warnings as OBJECTS ({ kind, detail, row_id? }) — see
 * lib/agents/impl/workforce-return-to-service-checker.ts. Client-side error
 * fallbacks, however, push a plain string (e.g. "Preflight check could not
 * run."). So any UI that lists these items must tolerate BOTH shapes — handing
 * a raw object to JSX as a child throws "Objects are not valid as a React
 * child" and trips the page's error boundary.
 */

export type RtsIssue = { kind: string; detail: string; row_id?: string }

/** The display string for an RTS blocker/warning, accepting object or string. */
export function rtsIssueText(item: RtsIssue | string | null | undefined): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') return item.detail ?? ''
  return ''
}
