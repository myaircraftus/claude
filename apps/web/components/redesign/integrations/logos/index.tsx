/**
 * Inline brand SVG logo components for integration tiles.
 *
 * Why inline?
 * - No network round-trip / no broken image fallbacks.
 * - Easy to colour for the connected/disconnected state.
 * - Stays sharp at any tile size.
 *
 * Each logo is rendered into a 40 / 48 px rounded square. Logos either fit
 * a 24x24 SVG viewBox (simple-icons style mark) or a 40x40 viewBox for
 * wordmarks. We never display rasterised PNGs / generic Lucide icons here —
 * if a provider does not have a real brand mark yet, we render a clean
 * monogram with the provider's brand colour.
 */

import * as React from 'react'

type LogoProps = {
  className?: string
  size?: number
}

function Frame({
  children,
  bg = '#ffffff',
  border = true,
  className,
  size = 40,
}: LogoProps & { children: React.ReactNode; bg?: string; border?: boolean }) {
  return (
    <div
      className={
        'flex items-center justify-center overflow-hidden rounded-xl ' +
        (border ? 'border border-border ' : '') +
        (className ?? '')
      }
      style={{ width: size, height: size, background: bg }}
    >
      {children}
    </div>
  )
}

/* ============== ACCOUNTING ============== */

export function QuickBooksLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#FFFFFF">
      <svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden>
        <path
          fill="#2CA01C"
          d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm.642 4.1335c.9554 0 1.7296.776 1.7296 1.7332v9.0667h1.6c1.614 0 2.9275-1.3156 2.9275-2.933 0-1.6173-1.3136-2.9333-2.9276-2.9333h-.6654V7.3334h.6654c2.5722 0 4.6577 2.0897 4.6577 4.667 0 2.5774-2.0855 4.6666-4.6577 4.6666H12.642zM7.9837 7.333h3.3291v12.533c-.9555 0-1.73-.7759-1.73-1.7332V9.0662H7.9837c-1.6146 0-2.9277 1.316-2.9277 2.9334 0 1.6175 1.3131 2.9333 2.9277 2.9333h.6654v1.7332h-.6654c-2.5725 0-4.6577-2.0892-4.6577-4.6665 0-2.5771 2.0852-4.6666 4.6577-4.6666Z"
        />
      </svg>
    </Frame>
  )
}

export function FreshBooksLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0075DD" border={false}>
      <svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden>
        <path
          fill="#FFFFFF"
          d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm0 4.4a7.6 7.6 0 0 1 7.555 6.823h-3.05a4.6 4.6 0 0 0-9.01 0H4.445A7.6 7.6 0 0 1 12 4.4Zm-3.85 9.05A4.6 4.6 0 0 0 12 16.55a4.6 4.6 0 0 0 3.85-3.1h3.7a7.6 7.6 0 0 1-15.1 0Z"
        />
      </svg>
    </Frame>
  )
}

/* ============== STORAGE ============== */

export function GoogleDriveLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#FFFFFF">
      <svg viewBox="0 0 87.3 78" width="64%" height="64%" aria-hidden>
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    </Frame>
  )
}

/* ============== AVIATION — TRACKING ============== */

export function FlightAwareLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#003C71" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text
          x="20"
          y="16"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="9"
          fontWeight="800"
          fill="#FFFFFF"
          letterSpacing="0.5"
        >
          FLIGHT
        </text>
        <text
          x="20"
          y="28"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="9"
          fontWeight="800"
          fill="#3B9DDF"
          letterSpacing="0.5"
        >
          AWARE
        </text>
      </svg>
    </Frame>
  )
}

export function FlightRadar24Logo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#F9C82E" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text
          x="20"
          y="18"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="8"
          fontWeight="800"
          fill="#0A1628"
          letterSpacing="0.5"
        >
          FLIGHT
        </text>
        <text
          x="20"
          y="30"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="11"
          fontWeight="900"
          fill="#0A1628"
        >
          24
        </text>
      </svg>
    </Frame>
  )
}

export function ADSBExchangeLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0F172A" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text
          x="20"
          y="18"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="9"
          fontWeight="900"
          fill="#F97316"
          letterSpacing="0.5"
        >
          ADS-B
        </text>
        <text
          x="20"
          y="30"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="6"
          fontWeight="700"
          fill="#FFFFFF"
          letterSpacing="0.5"
        >
          EXCHANGE
        </text>
      </svg>
    </Frame>
  )
}

/* ============== AVIATION — SCHEDULING ============== */

export function FlightSchedulePro({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1E40AF" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text
          x="20"
          y="17"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="6"
          fontWeight="800"
          fill="#FFFFFF"
          letterSpacing="0.3"
        >
          FLIGHT
        </text>
        <text
          x="20"
          y="25"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="6"
          fontWeight="800"
          fill="#FFFFFF"
          letterSpacing="0.3"
        >
          SCHEDULE
        </text>
        <text
          x="20"
          y="34"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, -apple-system"
          fontSize="9"
          fontWeight="900"
          fill="#FBBF24"
        >
          PRO
        </text>
      </svg>
    </Frame>
  )
}

export function FlightCircleLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0EA5E9" border={false}>
      <svg viewBox="0 0 40 40" width="68%" height="68%" aria-hidden>
        <circle cx="20" cy="20" r="18" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
        <path d="M10 22l8-7 5 4 7-9" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Frame>
  )
}

export function ScheduleMasterLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0369A1" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="17" textAnchor="middle" fontFamily="system-ui" fontSize="6" fontWeight="800" fill="#FFFFFF" letterSpacing="0.4">
          SCHEDULE
        </text>
        <text x="20" y="29" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FFFFFF">
          MASTER
        </text>
      </svg>
    </Frame>
  )
}

export function SchedAeroLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1F2937" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FFFFFF">
          Sched
        </text>
        <text x="20" y="32" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#22D3EE">
          Aero
        </text>
      </svg>
    </Frame>
  )
}

export function MyFlightbookLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0EA5E9" border={false}>
      <svg viewBox="0 0 40 40" width="68%" height="68%" aria-hidden>
        <path
          d="M8 11h17a4 4 0 0 1 4 4v14H12a4 4 0 0 1-4-4z"
          fill="#FFFFFF"
        />
        <path d="M12 14v15" stroke="#0EA5E9" strokeWidth="1.4" />
        <path d="M16 18h9M16 22h9M16 26h6" stroke="#0EA5E9" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </Frame>
  )
}

export function AeroCrewLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1E3A8A" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FFFFFF">
          AERO
        </text>
        <text x="20" y="32" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FBBF24">
          CREW
        </text>
      </svg>
    </Frame>
  )
}

export function FltPlanLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#F1F5F9">
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="25" textAnchor="middle" fontFamily="system-ui" fontSize="11" fontWeight="900" fill="#0F172A">
          FltPlan
        </text>
      </svg>
    </Frame>
  )
}

export function AvPlanLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#15803D" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="11" fontWeight="900" fill="#FFFFFF">
          AvPlan
        </text>
        <text x="20" y="31" textAnchor="middle" fontFamily="system-ui" fontSize="6" fontWeight="800" fill="#86EFAC" letterSpacing="2">
          EFB
        </text>
      </svg>
    </Frame>
  )
}

/* ============== AVIATION — MAINTENANCE ============== */

export function CampSystemsLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1A4D8C" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="25" textAnchor="middle" fontFamily="system-ui" fontSize="13" fontWeight="900" fill="#FFFFFF" letterSpacing="1">
          CAMP
        </text>
      </svg>
    </Frame>
  )
}

export function FlightdocsLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1E40AF" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="8" fontWeight="900" fill="#FFFFFF">
          FLIGHT
        </text>
        <text x="20" y="32" textAnchor="middle" fontFamily="system-ui" fontSize="8" fontWeight="900" fill="#7DD3FC">
          DOCS
        </text>
      </svg>
    </Frame>
  )
}

export function TraxxallLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0F766E" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="25" textAnchor="middle" fontFamily="system-ui" fontSize="10" fontWeight="900" fill="#FFFFFF" letterSpacing="0.5">
          Traxxall
        </text>
      </svg>
    </Frame>
  )
}

export function QuantumControlLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#7C3AED" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="22" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FFFFFF">
          QUANTUM
        </text>
        <text x="20" y="32" textAnchor="middle" fontFamily="system-ui" fontSize="7" fontWeight="700" fill="#C4B5FD" letterSpacing="1.5">
          CONTROL
        </text>
      </svg>
    </Frame>
  )
}

export function CorridorLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#DC2626" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="25" textAnchor="middle" fontFamily="system-ui" fontSize="10" fontWeight="900" fill="#FFFFFF">
          Corridor
        </text>
      </svg>
    </Frame>
  )
}

export function ATPHubLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0F172A" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="20" textAnchor="middle" fontFamily="system-ui" fontSize="13" fontWeight="900" fill="#FFFFFF" letterSpacing="1.5">
          ATP
        </text>
        <text x="20" y="30" textAnchor="middle" fontFamily="system-ui" fontSize="6" fontWeight="700" fill="#94A3B8" letterSpacing="1">
          AVIATION HUB
        </text>
      </svg>
    </Frame>
  )
}

export function WinAirLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0284C7" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="25" textAnchor="middle" fontFamily="system-ui" fontSize="11" fontWeight="900" fill="#FFFFFF">
          WinAir
        </text>
      </svg>
    </Frame>
  )
}

export function LogbookProLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#312E81" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="20" textAnchor="middle" fontFamily="system-ui" fontSize="8" fontWeight="900" fill="#FFFFFF">
          Logbook
        </text>
        <text x="20" y="30" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FBBF24">
          Pro
        </text>
      </svg>
    </Frame>
  )
}

export function SmartAviationLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0E7490" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="20" textAnchor="middle" fontFamily="system-ui" fontSize="7" fontWeight="900" fill="#FFFFFF">
          SMART
        </text>
        <text x="20" y="30" textAnchor="middle" fontFamily="system-ui" fontSize="7" fontWeight="900" fill="#67E8F9">
          AVIATION
        </text>
      </svg>
    </Frame>
  )
}

export function MxCommanderLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#B45309" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="20" textAnchor="middle" fontFamily="system-ui" fontSize="11" fontWeight="900" fill="#FFFFFF">
          Mx
        </text>
        <text x="20" y="31" textAnchor="middle" fontFamily="system-ui" fontSize="6" fontWeight="800" fill="#FCD34D" letterSpacing="1">
          COMMANDER
        </text>
      </svg>
    </Frame>
  )
}

export function SafetyCultureLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#1E293B" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <path
          d="M20 7l11 5v8c0 7-5 11-11 13C9 31 4 27 4 20v-8z"
          fill="none"
          stroke="#F97316"
          strokeWidth="2.4"
        />
        <path d="M14 21l4 4 8-9" stroke="#F97316" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Frame>
  )
}

export function AvioBookLogo({ className, size = 40 }: LogoProps) {
  return (
    <Frame className={className} size={size} bg="#0F172A" border={false}>
      <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden>
        <text x="20" y="23" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#FFFFFF">
          Avio
        </text>
        <text x="20" y="33" textAnchor="middle" fontFamily="system-ui" fontSize="9" fontWeight="900" fill="#22D3EE">
          Book
        </text>
      </svg>
    </Frame>
  )
}

/* ============== INITIALS FALLBACK ============== */

export function InitialsLogo({
  name,
  size = 40,
  className,
  bg = '#0A1628',
}: LogoProps & { name: string; bg?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <Frame className={className} size={size} bg={bg} border={false}>
      <span style={{ color: '#FFFFFF', fontWeight: 800, fontSize: size * 0.32 }}>{initials}</span>
    </Frame>
  )
}

/* ============== REGISTRY ============== */

export type IntegrationLogoId =
  | 'quickbooks'
  | 'freshbooks'
  | 'googledrive'
  | 'flightschedulepro'
  | 'flightcircle'
  | 'schedulemaster'
  | 'schedaero'
  | 'myflightbook'
  | 'aerocrew'
  | 'fltplan'
  | 'avplan'
  | 'flightaware'
  | 'adsbexchange'
  | 'flightradar'
  | 'camp'
  | 'flightdocs'
  | 'traxxall'
  | 'quantum'
  | 'corridor'
  | 'atphub'
  | 'winair'
  | 'logbookpro'
  | 'smartaviation'
  | 'mxcommander'
  | 'safetyculture'
  | 'aviobook'

const LOGO_BY_ID: Record<IntegrationLogoId, React.ComponentType<LogoProps>> = {
  quickbooks: QuickBooksLogo,
  freshbooks: FreshBooksLogo,
  googledrive: GoogleDriveLogo,
  flightschedulepro: FlightSchedulePro,
  flightcircle: FlightCircleLogo,
  schedulemaster: ScheduleMasterLogo,
  schedaero: SchedAeroLogo,
  myflightbook: MyFlightbookLogo,
  aerocrew: AeroCrewLogo,
  fltplan: FltPlanLogo,
  avplan: AvPlanLogo,
  flightaware: FlightAwareLogo,
  adsbexchange: ADSBExchangeLogo,
  flightradar: FlightRadar24Logo,
  camp: CampSystemsLogo,
  flightdocs: FlightdocsLogo,
  traxxall: TraxxallLogo,
  quantum: QuantumControlLogo,
  corridor: CorridorLogo,
  atphub: ATPHubLogo,
  winair: WinAirLogo,
  logbookpro: LogbookProLogo,
  smartaviation: SmartAviationLogo,
  mxcommander: MxCommanderLogo,
  safetyculture: SafetyCultureLogo,
  aviobook: AvioBookLogo,
}

export function getIntegrationLogo(id: IntegrationLogoId): React.ComponentType<LogoProps> {
  return LOGO_BY_ID[id]
}
