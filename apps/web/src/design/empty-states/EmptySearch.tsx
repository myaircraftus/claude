import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** Search returned 0 results — magnifier over a blank document. */
export function EmptySearch({
  headline = 'No results found',
  subtext = 'We couldn’t find a match. Try fewer keywords or a different part number.',
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
          {/* blank document */}
          <rect x="74" y="34" width="92" height="116" rx="8" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
          {/* faded placeholder lines on the doc */}
          <line x1="88" y1="56" x2="138" y2="56" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
          <line x1="88" y1="74" x2="152" y2="74" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
          <line x1="88" y1="92" x2="128" y2="92" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
          <line x1="88" y1="110" x2="148" y2="110" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
          {/* magnifier glass */}
          <circle cx="142" cy="104" r="34" fill="#DBEAFE" fillOpacity="0.65" stroke="#2563EB" strokeWidth="5" />
          <circle cx="142" cy="104" r="34" fill="none" stroke="#1B2B5E" strokeWidth="1" strokeOpacity="0.2" />
          {/* magnifier handle */}
          <line
            x1="166"
            y1="128"
            x2="190"
            y2="152"
            stroke="#1B2B5E"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* "no match" mark inside the glass */}
          <line x1="131" y1="93" x2="153" y2="115" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
          <line x1="153" y1="93" x2="131" y2="115" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
        </svg>
      }
    />
  )
}
