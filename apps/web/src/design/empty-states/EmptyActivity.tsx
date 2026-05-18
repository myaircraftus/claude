import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** No recent activity — a flat timeline with no events. */
export function EmptyActivity({
  headline = 'No recent activity',
  subtext = 'Your timeline is clear. Actions across your hangar will show up here as they happen.',
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
          {/* timeline rail */}
          <line x1="60" y1="90" x2="180" y2="90" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
          {/* empty (unfilled) node markers along the rail */}
          {[60, 100, 140, 180].map((cx) => (
            <circle
              key={cx}
              cx={cx}
              cy="90"
              r="9"
              fill="#FFFFFF"
              stroke="#64748B"
              strokeWidth="2.5"
            />
          ))}
          {/* one node tinted as the "next event lands here" hint */}
          <circle cx="100" cy="90" r="9" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2.5" />
          {/* faint placeholder event cards above/below the rail — empty */}
          <g>
            <rect x="44" y="46" width="56" height="26" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="2" />
            <line x1="52" y1="56" x2="84" y2="56" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <line x1="52" y1="64" x2="74" y2="64" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <line x1="72" y1="72" x2="72" y2="81" stroke="#E2E8F0" strokeWidth="2" />
          </g>
          <g>
            <rect x="124" y="108" width="56" height="26" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="2" />
            <line x1="132" y1="118" x2="164" y2="118" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <line x1="132" y1="126" x2="154" y2="126" stroke="#E2E8F0" strokeWidth="4" strokeLinecap="round" />
            <line x1="152" y1="99" x2="152" y2="108" stroke="#E2E8F0" strokeWidth="2" />
          </g>
        </svg>
      }
    />
  )
}
