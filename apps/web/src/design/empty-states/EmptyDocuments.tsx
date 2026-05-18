import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** No documents uploaded — an open empty folder with blank pages. */
export function EmptyDocuments({
  headline = 'No documents yet',
  subtext = 'Upload logbooks, ADs and airworthiness records — we’ll index them for instant search.',
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
          {/* folder back panel + tab */}
          <path
            d="M52 58 h44 l12 14 h80 a8 8 0 0 1 8 8 v54 a8 8 0 0 1 -8 8 H52 a8 8 0 0 1 -8 -8 V66 a8 8 0 0 1 8 -8 Z"
            fill="#1B2B5E"
          />
          {/* blank pages peeking out of the folder */}
          <rect x="74" y="50" width="56" height="74" rx="5" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" transform="rotate(-7 102 87)" />
          <rect x="108" y="50" width="56" height="74" rx="5" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" transform="rotate(6 136 87)" />
          {/* faint text lines on the front page */}
          <g transform="rotate(6 136 87)">
            <line x1="120" y1="68" x2="152" y2="68" stroke="#F1F5F9" strokeWidth="5" strokeLinecap="round" />
            <line x1="120" y1="80" x2="156" y2="80" stroke="#F1F5F9" strokeWidth="5" strokeLinecap="round" />
            <line x1="120" y1="92" x2="144" y2="92" stroke="#F1F5F9" strokeWidth="5" strokeLinecap="round" />
          </g>
          {/* open folder front flap */}
          <path
            d="M44 90 h152 a8 8 0 0 1 7.8 9.7 l-8.6 38 a8 8 0 0 1 -7.8 6.3 H52.6 a8 8 0 0 1 -7.8 -6.3 l-8.6 -38 A8 8 0 0 1 44 90 Z"
            fill="#2563EB"
          />
          {/* upload arrow hint */}
          <circle cx="120" cy="38" r="16" fill="#DBEAFE" />
          <path d="M120 30 v16 M113 37 l7 -7 l7 7" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      }
    />
  )
}
