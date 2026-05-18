import { EmptyStateShell, type EmptyStateProps } from './EmptyStateShell'

/** No work orders — an empty clipboard. */
export function EmptyWorkOrders({
  headline = 'No work orders',
  subtext = 'Create a work order to schedule maintenance and track every task to sign-off.',
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
          {/* clipboard board */}
          <rect x="68" y="36" width="104" height="124" rx="10" fill="#1B2B5E" />
          {/* paper sheet */}
          <rect x="78" y="48" width="84" height="104" rx="6" fill="#FFFFFF" />
          {/* clip */}
          <rect x="104" y="26" width="32" height="20" rx="6" fill="#2563EB" />
          <rect x="112" y="20" width="16" height="12" rx="5" fill="#64748B" />
          {/* empty checklist rows — unchecked boxes, no text */}
          {[68, 90, 112, 134].map((y) => (
            <g key={y}>
              <rect x="88" y={y} width="14" height="14" rx="3" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="2" />
              <line x1="110" y1={y + 7} x2="152" y2={y + 7} stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round" />
            </g>
          ))}
          {/* "add" hint badge */}
          <circle cx="156" cy="138" r="17" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2" />
          <path d="M156 130 v16 M148 138 h16" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" />
        </svg>
      }
    />
  )
}
