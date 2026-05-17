// Aircraft Intelligence — index. Shows the 4 AI analysis modules as cards.
// Owner + admin only; the shop persona sees a request-access message.
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { History, ClipboardCheck, ShieldCheck, AlertTriangle, Brain, Lock, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft Intelligence' }

const MODULES = [
  {
    key: 'history',
    title: 'Full History Package',
    desc: 'A complete, source-cited maintenance history — identity, inspection timeline, AD summary, damage history, current status, and document completeness.',
    icon: History,
  },
  {
    key: 'prebuy',
    title: 'Prebuy Report',
    desc: 'A neutral, flags-focused pre-purchase evaluation with a GREEN / YELLOW / RED risk score across logbook continuity, engine/prop, damage, ADs, STCs, and records.',
    icon: ClipboardCheck,
  },
  {
    key: 'ad-traceability',
    title: 'AD / SB Traceability',
    desc: 'Every Airworthiness Directive mentioned in the records mapped to its compliance evidence, with recurring-AD due dates and gap flags.',
    icon: ShieldCheck,
  },
  {
    key: 'missing-records',
    title: 'Missing Records Detector',
    desc: 'Finds gaps and anomalies that suggest records are missing — annual gaps, unexplained tach jumps, missing engine/prop logbooks, post-strike inspections.',
    icon: AlertTriangle,
  },
] as const

export default async function AircraftIntelligencePage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  let persona: 'owner' | 'shop' | 'admin' = 'owner'
  try {
    persona = (await getCurrentPersona()).persona
  } catch {
    // defensive — page already requires a session
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!aircraft) redirect('/aircraft')

  const ac = aircraft as { id: string; tail_number: string; make: string | null; model: string | null }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: ac.tail_number, href: `/aircraft/${ac.id}` },
          { label: 'Intelligence' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Aircraft Intelligence
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {ac.tail_number}
                {[ac.make, ac.model].filter(Boolean).length > 0
                  ? ` · ${[ac.make, ac.model].filter(Boolean).join(' ')}`
                  : ''}
                {' '}— AI analysis over this aircraft&apos;s uploaded records.
              </p>
            </div>
          </div>

          {persona === 'shop' ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Aircraft Intelligence is owner-only
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                These analysis reports run over the owner&apos;s private aircraft records.
                Request access from the aircraft owner to view the History, Prebuy,
                AD Traceability, and Missing Records modules.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MODULES.map((m) => {
                const Icon = m.icon
                return (
                  <Link
                    key={m.key}
                    href={`/aircraft/${ac.id}/intelligence/${m.key}`}
                    className="group rounded-xl border border-border bg-white p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                          {m.title}
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{m.desc}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
