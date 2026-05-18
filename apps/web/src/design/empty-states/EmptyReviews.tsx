import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** Seller has no reviews yet — a row of blank star outlines. */
export function EmptyReviews({
  headline = 'No reviews yet',
  subtext = 'Once buyers receive their orders, their ratings will show up here.',
  cta,
  className,
}: EmptyStateProps) {
  // Five-pointed star path centered roughly on (0,0), radius ~20.
  const starPath =
    'M0 -20 L5.9 -6.2 L20.9 -6.2 L8.5 2.4 L13.2 16.2 L0 7.6 L-13.2 16.2 L-8.5 2.4 L-20.9 -6.2 L-5.9 -6.2 Z'

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
          {/* review card */}
          <rect x="40" y="46" width="160" height="88" rx="12" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          {/* row of blank star outlines */}
          {[68, 100, 132, 164].map((cx) => (
            <g key={cx} transform={`translate(${cx} 84)`}>
              <path d={starPath} fill="#F1F5F9" stroke="#64748B" strokeWidth="2" strokeLinejoin="round" />
            </g>
          ))}
          {/* one star highlighted as the "first review" hint */}
          <g transform="translate(68 84)">
            <path d={starPath} fill="#DBEAFE" stroke="#2563EB" strokeWidth="2.5" strokeLinejoin="round" />
          </g>
          {/* placeholder review text lines */}
          <line x1="58" y1="112" x2="150" y2="112" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
          <line x1="58" y1="124" x2="118" y2="124" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
        </svg>
      }
    />
  )
}
