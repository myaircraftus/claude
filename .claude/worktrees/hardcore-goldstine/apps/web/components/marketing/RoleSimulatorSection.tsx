'use client'

import { useState, useEffect, useRef } from 'react'
import { roleDefinitions, type RoleDefinition, type RoleScenario, type SimulatorRole } from '../../data/roleSimulatorData'

// ─── Icon Map ────────────────────────────────────────────────────────────────

function Icon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  const s = size
  const stroke = 'currentColor'
  const sw = '1.75'
  const lc = 'round'
  const lj = 'round'

  const icons: Record<string, React.ReactNode> = {
    Wrench: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
    ClipboardCheck: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>
      </svg>
    ),
    Key: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>
      </svg>
    ),
    PlaneTakeoff: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1A2 2 0 0 0 6.8 12.8l.17-.1a4 4 0 0 1 3.6 0l.17.1a4 4 0 0 0 3.6 0l.17-.1a4 4 0 0 1 3.6 0l1.1.56-2 3.45-.44.4A2 2 0 0 1 15.5 17H13l-1.3 2.6a1 1 0 0 1-.9.4z"/>
      </svg>
    ),
    Shield: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    Search: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    Briefcase: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12.01"/>
      </svg>
    ),
    LayoutGrid: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
    ArrowRight: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
      </svg>
    ),
    FileText: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    ChevronRight: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    ),
    Sparkles: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj} className={className}>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
      </svg>
    ),
  }

  return <>{icons[name] ?? null}</>
}

// ─── Color config ─────────────────────────────────────────────────────────────

const colorConfig: Record<string, { bg: string; text: string; border: string; activeBg: string; activeBorder: string; badgeBg: string; badgeText: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   activeBg: 'bg-blue-600',   activeBorder: 'border-blue-600',   badgeBg: 'bg-blue-100',    badgeText: 'text-blue-700'    },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200', activeBg: 'bg-indigo-600', activeBorder: 'border-indigo-600', badgeBg: 'bg-indigo-100',  badgeText: 'text-indigo-700'  },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200', activeBg: 'bg-violet-600', activeBorder: 'border-violet-600', badgeBg: 'bg-violet-100',  badgeText: 'text-violet-700'  },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',    activeBg: 'bg-sky-500',    activeBorder: 'border-sky-500',    badgeBg: 'bg-sky-100',     badgeText: 'text-sky-700'     },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',    activeBg: 'bg-red-600',    activeBorder: 'border-red-600',    badgeBg: 'bg-red-100',     badgeText: 'text-red-700'     },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  activeBg: 'bg-amber-500',  activeBorder: 'border-amber-500',  badgeBg: 'bg-amber-100',   badgeText: 'text-amber-700'   },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',activeBg: 'bg-emerald-600',activeBorder: 'border-emerald-600',badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200', activeBg: 'bg-orange-500', activeBorder: 'border-orange-500', badgeBg: 'bg-orange-100',  badgeText: 'text-orange-700'  },
}

// Aircraft info derived from the scenario data
const aircraftByRole: Record<SimulatorRole, { tailNumber: string; makeModel: string }> = {
  mechanic:     { tailNumber: 'N8202L', makeModel: 'Cessna 172S' },
  ia:           { tailNumber: 'N8202L', makeModel: 'Cessna 172S' },
  owner:        { tailNumber: 'N8202L', makeModel: 'Cessna 172S' },
  pilot:        { tailNumber: 'N8202L', makeModel: 'Cessna 172S' },
  faaInspector: { tailNumber: 'N8202L', makeModel: 'Cessna 172S' },
  buyer:        { tailNumber: 'N4409K', makeModel: 'Piper PA-28' },
  dealer:       { tailNumber: 'N2240E', makeModel: 'Beechcraft Baron 58' },
  fleetAdmin:   { tailNumber: 'Fleet',  makeModel: '5 Aircraft' },
}

// ─── Loading dots ─────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-blue-400"
          style={{
            animation: 'bounce 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: 'high' | 'medium' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
      level === 'high'
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${level === 'high' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
      {level === 'high' ? 'Source-verified · High confidence' : 'Source-verified · Medium confidence'}
    </span>
  )
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCardItem({ card }: { card: { label: string; docType: string; page: string; snippet: string } }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer group">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-100 transition-colors">
          <Icon name="FileText" size={13} className="text-slate-500 group-hover:text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[11px] font-semibold text-slate-700 truncate">{card.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium flex-shrink-0">{card.docType}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{card.snippet}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Simulator Canvas ─────────────────────────────────────────────────────────

function SimulatorCanvas({
  role,
  scenario,
  isLoading,
  showAnswer,
}: {
  role: RoleDefinition
  scenario: RoleScenario | null
  isLoading: boolean
  showAnswer: boolean
}) {
  const aircraft = aircraftByRole[role.id]
  const colors = colorConfig[role.color]

  return (
    <div
      className="flex-1 rounded-2xl overflow-hidden shadow-[0_4px_32px_rgba(0,0,0,0.1),0_1px_4px_rgba(0,0,0,0.06)] border border-slate-200"
      style={{ minHeight: 540 }}
    >
      {/* App mini-header (dark) */}
      <div className="bg-[#0D1117] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Window dots */}
          <div className="flex items-center gap-1 mr-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
          </div>
          {/* Aircraft badge */}
          <div className="flex items-center gap-2 pl-1">
            <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
              <Icon name="PlaneTakeoff" size={12} className="text-blue-400" />
            </div>
            <span className="font-mono text-[13px] font-bold text-white tracking-wide">{aircraft.tailNumber}</span>
            <span className="text-[#6B7280] text-[11px]">{aircraft.makeModel}</span>
          </div>
        </div>
        {/* Role badge */}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${colors.badgeBg} ${colors.badgeText}`}>
          {role.shortLabel}
        </span>
      </div>

      {/* Content area */}
      <div className="bg-[#F8F9FB] min-h-[496px] flex flex-col">

        {/* Ask bar */}
        <div className="px-4 pt-4 pb-3">
          <div className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm transition-all duration-300 ${
            scenario ? 'border-blue-300 shadow-blue-100' : 'border-slate-200'
          }`}>
            <Icon name="Search" size={15} className="text-slate-400 flex-shrink-0" />
            <span className={`text-[13px] flex-1 min-w-0 transition-all duration-200 ${
              scenario ? 'text-slate-800' : 'text-slate-400'
            }`}>
              {scenario ? scenario.prompt : `Ask anything about ${aircraft.tailNumber}…`}
            </span>
            {isLoading && (
              <div className="flex-shrink-0">
                <LoadingDots />
              </div>
            )}
            {!isLoading && showAnswer && scenario && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">Done</span>
            )}
          </div>
        </div>

        {/* Answer area */}
        <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto" style={{ maxHeight: 420 }}>

          {/* Loading state */}
          {isLoading && (
            <div
              className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm"
              style={{ animation: 'fadeIn 0.2s ease-out' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                  <Icon name="Sparkles" size={13} className="text-blue-500" />
                </div>
                <span className="text-[12px] text-slate-500">Searching documents…</span>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                <div className="h-3 bg-slate-100 rounded-full w-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                <div className="h-3 bg-slate-100 rounded-full w-5/6 animate-pulse" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          )}

          {/* Answer */}
          {showAnswer && !isLoading && scenario && (
            <div style={{ animation: 'fadeSlideIn 0.35s ease-out' }}>
              {/* Main answer card */}
              <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm mb-3">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name="Sparkles" size={13} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                      <h3 className="text-[13px] font-bold text-slate-800 leading-snug">{scenario.answerTitle}</h3>
                      <ConfidenceBadge level={scenario.confidence} />
                    </div>
                    <p className="text-[12.5px] text-slate-600 leading-relaxed">{scenario.answerBody}</p>
                  </div>
                </div>

                {/* Quick actions */}
                {scenario.quickActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100">
                    {scenario.quickActions.map((action) => (
                      <button
                        key={action}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Source cards */}
              {scenario.sourceCards.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-0.5">
                    {scenario.sourceCards.length} Source{scenario.sourceCards.length > 1 ? 's' : ''} Found
                  </p>
                  <div className="space-y-2">
                    {scenario.sourceCards.map((card, i) => (
                      <SourceCardItem key={i} card={card} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !showAnswer && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mb-3">
                <Icon name={role.icon} size={22} className="text-blue-500" />
              </div>
              <p className="text-[13px] font-semibold text-slate-700 mb-1">Select a question to see it in action</p>
              <p className="text-[12px] text-slate-400">Choose a scenario from the panel on the right</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── Right Panel ─────────────────────────────────────────────────────────────

function RightPanel({
  role,
  activeScenario,
  onSelectScenario,
}: {
  role: RoleDefinition
  activeScenario: RoleScenario | null
  onSelectScenario: (s: RoleScenario) => void
}) {
  const colors = colorConfig[role.color]

  return (
    <div className="w-full lg:w-72 flex flex-col gap-4">
      {/* Scenario list */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Try These Scenarios</p>
        </div>
        <div className="p-3 space-y-1.5">
          {role.scenarios.map((scenario) => {
            const isActive = activeScenario?.id === scenario.id
            return (
              <button
                key={scenario.id}
                onClick={() => onSelectScenario(scenario)}
                className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 group ${
                  isActive
                    ? `${colors.bg} ${colors.border} border`
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 transition-colors ${
                    isActive ? colors.text.replace('text-', 'bg-') : 'bg-slate-300'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-[12px] font-semibold leading-snug mb-0.5 ${isActive ? colors.text : 'text-slate-700'}`}>
                      {scenario.title}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {scenario.prompt}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Next questions */}
      {activeScenario?.nextQuestions && activeScenario.nextQuestions.length > 0 && (
        <div
          className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          style={{ animation: 'fadeSlideIn2 0.3s ease-out' }}
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Follow-Up Questions</p>
          </div>
          <div className="p-3 space-y-1.5">
            {activeScenario.nextQuestions.map((q) => (
              <button
                key={q}
                className="w-full text-left rounded-xl px-3 py-2 hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <Icon name="ChevronRight" size={12} className="text-slate-300 group-hover:text-blue-400 mt-0.5 flex-shrink-0 transition-colors" />
                  <span className="text-[11.5px] text-slate-500 group-hover:text-blue-600 leading-relaxed transition-colors">{q}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn2 {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ─── Role Rail (desktop sidebar) ──────────────────────────────────────────────

function RoleRail({
  activeRole,
  onSelectRole,
}: {
  activeRole: SimulatorRole
  onSelectRole: (id: SimulatorRole) => void
}) {
  return (
    <div className="hidden lg:flex flex-col w-52 flex-shrink-0 gap-1.5">
      {roleDefinitions.map((role) => {
        const isActive = role.id === activeRole
        const colors = colorConfig[role.color]
        return (
          <button
            key={role.id}
            onClick={() => onSelectRole(role.id)}
            className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 border ${
              isActive
                ? `${colors.bg} ${colors.activeBorder} border shadow-sm`
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2.5 mb-1">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isActive ? colors.text.replace('text-', 'bg-').replace('-700', '-100') : 'bg-slate-100'
              }`}>
                <Icon name={role.icon} size={13} className={isActive ? colors.text : 'text-slate-500'} />
              </div>
              <span className={`text-[12.5px] font-semibold ${isActive ? colors.text : 'text-slate-700'}`}>
                {role.label}
              </span>
            </div>
            <p className={`text-[11px] leading-relaxed pl-[34px] ${isActive ? colors.text.replace('-700', '-600') : 'text-slate-400'}`}>
              {role.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}

// ─── Role Chips (mobile) ──────────────────────────────────────────────────────

function RoleChips({
  activeRole,
  onSelectRole,
}: {
  activeRole: SimulatorRole
  onSelectRole: (id: SimulatorRole) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="lg:hidden overflow-x-auto pb-2 -mx-4 px-4" ref={scrollRef}>
      <div className="flex gap-2 w-max">
        {roleDefinitions.map((role) => {
          const isActive = role.id === activeRole
          const colors = colorConfig[role.color]
          return (
            <button
              key={role.id}
              onClick={() => onSelectRole(role.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? `${colors.bg} ${colors.activeBorder} ${colors.text} shadow-sm`
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon name={role.icon} size={13} className={isActive ? colors.text : 'text-slate-400'} />
              {role.shortLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RoleSimulatorSection() {
  const [activeRoleId, setActiveRoleId] = useState<SimulatorRole>('mechanic')
  const [activeScenario, setActiveScenario] = useState<RoleScenario | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeRole = roleDefinitions.find((r) => r.id === activeRoleId)!

  // Clear any pending timers
  const clearTimers = () => {
    if (loadingTimer.current) clearTimeout(loadingTimer.current)
    if (answerTimer.current) clearTimeout(answerTimer.current)
    if (autoTimer.current) clearTimeout(autoTimer.current)
  }

  // Auto-trigger first scenario on mount
  useEffect(() => {
    autoTimer.current = setTimeout(() => {
      const firstScenario = roleDefinitions[0].scenarios[0]
      triggerScenario(firstScenario)
    }, 500)
    return () => clearTimers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerScenario = (scenario: RoleScenario) => {
    clearTimers()
    setActiveScenario(scenario)
    setIsLoading(true)
    setShowAnswer(false)

    loadingTimer.current = setTimeout(() => {
      setIsLoading(false)
      setShowAnswer(true)
    }, 1500)
  }

  const handleSelectRole = (id: SimulatorRole) => {
    if (id === activeRoleId) return
    clearTimers()
    setIsTransitioning(true)
    setIsLoading(false)
    setShowAnswer(false)
    setActiveScenario(null)

    // Short delay for transition feel
    autoTimer.current = setTimeout(() => {
      setActiveRoleId(id)
      setIsTransitioning(false)
      // Auto-trigger first scenario for new role
      const role = roleDefinitions.find((r) => r.id === id)!
      triggerScenario(role.scenarios[0])
    }, 200)
  }

  const handleSelectScenario = (scenario: RoleScenario) => {
    triggerScenario(scenario)
  }

  return (
    <section className="py-24 px-4 sm:px-6 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #F8F9FB 0%, #FFFFFF 100%)' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #2563EB 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-4">
            <Icon name="Sparkles" size={13} className="text-blue-500" />
            Interactive Demo
          </div>
          <h2 className="text-[36px] sm:text-[44px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-3">
            See myaircraft.us in action
          </h2>
          <p className="text-[17px] text-[#4B5563] max-w-xl mx-auto leading-relaxed">
            Choose your role. See your workflow.
          </p>
        </div>

        {/* Mobile role chips */}
        <div className="mb-6">
          <RoleChips activeRole={activeRoleId} onSelectRole={handleSelectRole} />
        </div>

        {/* Main simulator layout */}
        <div
          className={`flex gap-5 items-start transition-opacity duration-200 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}
        >
          {/* Left rail — desktop */}
          <RoleRail activeRole={activeRoleId} onSelectRole={handleSelectRole} />

          {/* Center canvas */}
          <SimulatorCanvas
            role={activeRole}
            scenario={activeScenario}
            isLoading={isLoading}
            showAnswer={showAnswer}
          />

          {/* Right panel */}
          <RightPanel
            role={activeRole}
            activeScenario={activeScenario}
            onSelectScenario={handleSelectScenario}
          />
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-[14px] text-slate-500 mb-4">
            Ready to ask your aircraft anything?
          </p>
          <a
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.4)]"
          >
            Start for free
            <Icon name="ArrowRight" size={16} className="text-white" />
          </a>
        </div>
      </div>
    </section>
  )
}
