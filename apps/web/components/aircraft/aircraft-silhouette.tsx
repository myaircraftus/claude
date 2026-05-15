import type { AircraftSilhouetteStyle } from '@/lib/aircraft/workspace'

interface AircraftSilhouetteProps {
  tailNumber: string
  style?: AircraftSilhouetteStyle | string | null
  className?: string
  compact?: boolean
}

export function AircraftSilhouette({
  tailNumber,
  style = 'unknown',
  className = '',
  compact = false,
}: AircraftSilhouetteProps) {
  const isRotor = style === 'helicopter'
  const isJet = style === 'jet'
  const isGlider = style === 'glider'

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 ${className}`}
      aria-label={`Generated silhouette for ${tailNumber}`}
    >
      <svg
        viewBox="0 0 360 190"
        role="img"
        aria-hidden="true"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width="360" height="190" fill="url(#aircraftSilhouetteBg)" />
        <defs>
          <linearGradient id="aircraftSilhouetteBg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#eff6ff" />
          </linearGradient>
        </defs>
        {isRotor ? (
          <>
            <path d="M117 90h110c29 0 53 14 53 31 0 13-16 24-40 29H121c-20 0-39-10-48-25l-20-35h34l21 20h30z" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="4" />
            <path d="M162 78h26l12 13h-50z" fill="#bfdbfe" stroke="#1d4ed8" strokeWidth="3" />
            <path d="M188 75V47" stroke="#1d4ed8" strokeWidth="4" />
            <path d="M64 47h250" stroke="#2563eb" strokeWidth="5" strokeLinecap="round" />
            <path d="M246 118h70l23 14h-94" fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" />
            <path d="M118 151h119" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M42 105h118l89-47c20-11 45-7 61 10l10 11-132 53H44c-15 0-24-16-16-28 3-4 8-7 14-7z" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="4" />
            <path d="M158 103 66 48h36l114 55z" fill="#bfdbfe" stroke="#1d4ed8" strokeWidth="4" />
            <path d="M166 122 72 159h44l120-37z" fill="#bfdbfe" stroke="#1d4ed8" strokeWidth="4" />
            <path d="M279 76 319 43h21l-29 52z" fill="#dbeafe" stroke="#1d4ed8" strokeWidth="4" />
            {isJet ? (
              <>
                <ellipse cx="197" cy="125" rx="17" ry="10" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="4" />
                <ellipse cx="232" cy="112" rx="15" ry="9" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="4" />
              </>
            ) : null}
            {isGlider ? (
              <path d="M83 90h216" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round" />
            ) : null}
            <circle cx="88" cy="137" r="7" fill="#0f172a" />
            <circle cx="249" cy="137" r="7" fill="#0f172a" />
          </>
        )}
        <text
          x={compact ? '26' : '34'}
          y={compact ? '42' : '48'}
          fill="#0f172a"
          fontSize={compact ? '24' : '30'}
          fontWeight="800"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        >
          {tailNumber || 'N-----'}
        </text>
      </svg>
    </div>
  )
}
