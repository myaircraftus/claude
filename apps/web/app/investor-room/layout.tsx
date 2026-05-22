/**
 * Investor Room — dedicated shell.
 *
 * Mirrors the SOP Library shell pattern (apps/web/app/sop-library/layout.tsx):
 * lives at /investor-room (outside the (app) group) so it has its own
 * non-AppLayout shell. Admin-gated server-side — only platform admins
 * can see the room.
 *
 * Subpages:
 *   /investor-room                  landing + "the ask" summary
 *   /investor-room/pitch            slide deck (16 slides)
 *   /investor-room/pitch/present    full-screen presenter view
 *   /investor-room/business-plan    narrative plan
 *   /investor-room/data-room        diligence document index
 *   /investor-room/metrics          KPIs (placeholder until wired to DB)
 *   /investor-room/team             team
 *   /investor-room/faq              investor FAQ
 *
 * The "Present" link on the pitch page opens the present view in a new
 * tab with a fullscreen-on-mount handler so a click really does drop
 * the user straight into presentation mode.
 */

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Presentation,
  BookOpen,
  FolderLock,
  BarChart3,
  Users,
  HelpCircle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react'
import { createServerSupabase } from '@/lib/supabase/server'

export const metadata = {
  // Root layout already applies the '%s | myaircraft.us' template, so child
  // titles must NOT include the site suffix or it doubles up.
  title: 'Investor Room',
}

export default async function InvestorRoomLayout({ children }: { children: ReactNode }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/investor-room')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin, email, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.is_platform_admin) {
    redirect('/dashboard')
  }

  const userLabel = profile.email ?? user.email ?? 'admin'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex print:bg-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col print:hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <Link href="/investor-room" className="block">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
              myaircraft
            </div>
            <div className="text-base font-semibold text-slate-900">investor room</div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/investor-room"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span>Overview</span>
          </Link>
          <Link
            href="/investor-room/pitch"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Presentation className="w-4 h-4 text-amber-600" />
            <span>Pitch deck</span>
          </Link>
          <Link
            href="/investor-room/business-plan"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <BookOpen className="w-4 h-4 text-sky-600" />
            <span>Business plan</span>
          </Link>
          <Link
            href="/investor-room/data-room"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <FolderLock className="w-4 h-4 text-emerald-600" />
            <span>Data room</span>
          </Link>
          <Link
            href="/investor-room/metrics"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <BarChart3 className="w-4 h-4 text-rose-600" />
            <span>Metrics</span>
          </Link>
          <Link
            href="/investor-room/team"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Users className="w-4 h-4 text-fuchsia-600" />
            <span>Team</span>
          </Link>
          <Link
            href="/investor-room/faq"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-cyan-600" />
            <span>FAQ</span>
          </Link>
        </nav>

        <div className="px-3 py-4 border-t border-slate-200">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to app
          </Link>
        </div>
      </aside>

      {/* Right pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <FolderLock className="w-3 h-3" />
              Confidential
            </span>
            <span className="text-xs text-slate-600">Investor Room</span>
          </div>
          <div className="text-xs text-slate-500 truncate max-w-[40ch]">{userLabel}</div>
        </header>

        <main className="flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  )
}
