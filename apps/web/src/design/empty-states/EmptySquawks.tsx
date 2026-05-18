import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** No open squawks — a calm gauge in the green with a checkmark. */
export function EmptySquawks({
  headline = 'No open squawks',
  subtext = 'Everything checks out. New squawks will appear here as they’re reported.',
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
          {/* gauge bezel */}
          <circle cx="120" cy="98" r="62" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="3" />
          <circle cx="120" cy="98" r="50" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          {/* gauge arc — full sweep, calm */}
          <path
            d="M82 132 A50 50 0 1 1 158 132"
            fill="none"
            stroke="#DBEAFE"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* "in the green" segment */}
          <path
            d="M120 48 A50 50 0 0 1 158 132"
            fill="none"
            stroke="#2563EB"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* tick marks */}
          {[-130, -90, -50, -10, 30].map((deg) => {
            const r1 = 40
            const r2 = 46
            const rad = (deg * Math.PI) / 180
            return (
              <line
                key={deg}
                x1={120 + r1 * Math.cos(rad)}
                y1={98 + r1 * Math.sin(rad)}
                x2={120 + r2 * Math.cos(rad)}
                y2={98 + r2 * Math.sin(rad)}
                stroke="#64748B"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}
          {/* needle resting calmly toward the green */}
          <line x1="120" y1="98" x2="146" y2="74" stroke="#1B2B5E" strokeWidth="4" strokeLinecap="round" />
          <circle cx="120" cy="98" r="7" fill="#1B2B5E" />
          {/* reassuring checkmark badge */}
          <circle cx="120" cy="98" r="20" fill="#FFFFFF" />
          <circle cx="120" cy="98" r="18" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
          <path
            d="M111 99 l6 6 l12 -13"
            fill="none"
            stroke="#2563EB"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      }
    />
  )
}
