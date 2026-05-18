import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** Empty browse marketplace — empty shelf with hanging price tags. */
export function EmptyMarketplace({
  headline = 'No listings to browse yet',
  subtext = 'The marketplace is quiet right now. Check back soon — new parts are listed every day.',
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
          {/* shelf unit */}
          <rect x="48" y="44" width="144" height="96" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="2" />
          {/* shelf dividers */}
          <line x1="48" y1="92" x2="192" y2="92" stroke="#E2E8F0" strokeWidth="2" />
          <line x1="120" y1="44" x2="120" y2="140" stroke="#E2E8F0" strokeWidth="2" />
          {/* shelf top board */}
          <rect x="40" y="38" width="160" height="10" rx="3" fill="#1B2B5E" />
          {/* legs */}
          <rect x="56" y="140" width="8" height="20" rx="2" fill="#1B2B5E" />
          <rect x="176" y="140" width="8" height="20" rx="2" fill="#1B2B5E" />
          {/* hanging price tags */}
          <line x1="86" y1="48" x2="86" y2="66" stroke="#64748B" strokeWidth="2" />
          <g transform="rotate(-12 86 78)">
            <rect x="70" y="66" width="32" height="22" rx="4" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
            <circle cx="76" cy="72" r="2.5" fill="#2563EB" />
          </g>
          <line x1="154" y1="48" x2="154" y2="72" stroke="#64748B" strokeWidth="2" />
          <g transform="rotate(10 154 84)">
            <rect x="138" y="72" width="32" height="22" rx="4" fill="#FFFFFF" stroke="#2563EB" strokeWidth="2" />
            <circle cx="144" cy="78" r="2.5" fill="#2563EB" />
          </g>
        </svg>
      }
    />
  )
}
