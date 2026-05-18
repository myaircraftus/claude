import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** Seller has no listings yet — empty tag rack. */
export function EmptyMyListings({
  headline = 'No listings yet',
  subtext = 'List your first part in under 2 minutes — AI fills in the details.',
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
          {/* rack uprights */}
          <rect x="46" y="40" width="8" height="104" rx="3" fill="#1B2B5E" />
          <rect x="186" y="40" width="8" height="104" rx="3" fill="#1B2B5E" />
          {/* rack feet */}
          <rect x="34" y="140" width="32" height="8" rx="3" fill="#1B2B5E" />
          <rect x="174" y="140" width="32" height="8" rx="3" fill="#1B2B5E" />
          {/* hang rail */}
          <rect x="46" y="46" width="148" height="8" rx="4" fill="#2563EB" />
          {/* empty S-hooks on the rail — no tags hanging */}
          {[80, 110, 140, 170].map((x) => (
            <path
              key={x}
              d={`M${x} 54 q-6 6 0 12 q6 6 0 12`}
              stroke="#64748B"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          ))}
          {/* single faint placeholder tag outline (dashed = "add one here") */}
          <g transform="rotate(-8 120 104)">
            <rect
              x="100"
              y="86"
              width="40"
              height="40"
              rx="6"
              fill="#F1F5F9"
              stroke="#2563EB"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            <circle cx="108" cy="94" r="3" fill="none" stroke="#2563EB" strokeWidth="2" />
            <line x1="116" y1="118" x2="124" y2="110" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
            <line x1="120" y1="118" x2="120" y2="110" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      }
    />
  )
}
