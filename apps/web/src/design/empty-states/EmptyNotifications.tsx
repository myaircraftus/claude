import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** Notification tray empty — a quiet bell. */
export function EmptyNotifications({
  headline = 'You’re all caught up',
  subtext = 'No new notifications. We’ll let you know when something needs your attention.',
  cta,
  className,
}: EmptyStateProps) {
  return (
    <EmptyStateShell
      headline={headline}
      subtext={subtext}
      cta={cta}
      className={className}
      illustration={
        <svg
          width="240"
          height="180"
          viewBox="0 0 240 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
        >
          {/* soft halo behind the bell */}
          <circle cx="120" cy="92" r="58" fill="#F1F5F9" />
          {/* bell body */}
          <path
            d="M120 38 a8 8 0 0 1 8 8 v4 c18 6 28 22 28 44 v14 l10 14 a4 4 0 0 1 -3.4 6 H77.4 a4 4 0 0 1 -3.4 -6 l10 -14 v-14 c0 -22 10 -38 28 -44 v-4 a8 8 0 0 1 8 -8 Z"
            fill="#DBEAFE"
            stroke="#2563EB"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* bell top knob */}
          <circle cx="120" cy="36" r="6" fill="#1B2B5E" />
          {/* clapper — hanging still */}
          <path
            d="M110 134 a10 8 0 0 0 20 0 Z"
            fill="#1B2B5E"
          />
          {/* "quiet" Z's drifting up — calm, no alerts */}
          <path d="M150 56 h12 l-12 12 h12" stroke="#64748B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M166 38 h9 l-9 9 h9" stroke="#64748B" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      }
    />
  )
}
