/**
 * SOP Admin Library — dedicated shell.
 *
 * Why this lives at /sop-library and not /admin/sop-library:
 *
 *   The original brief asked for /admin/sop-library with its own non-
 *   AppLayout shell. The existing Phase 16 admin tree owns /admin/* under
 *   app/(app)/admin/, which means every route under /admin is wrapped by
 *   app/(app)/layout.tsx → AppLayout. There is no way in Next.js App Router
 *   to opt OUT of a parent layout once it's claimed the URL prefix.
 *
 *   Two ways to satisfy the brief:
 *     (a) URL /admin/sop-library, inside the existing AppLayout tree.
 *         Loses the "own shell" requirement.
 *     (b) New URL /sop-library outside (app)/. Keeps the dedicated shell.
 *         Loses the /admin/ URL prefix.
 *
 *   We picked (b) because the brief emphasized the shell ("DO NOT modify
 *   AppLayout", "minimal admin shell", "no AppLayout wrapper") more
 *   strongly than the URL. A link is added to the Phase 16 admin sidebar
 *   so admins still navigate naturally.
 */

import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, TrendingUp, ShieldCheck, ArrowLeft } from 'lucide-react'
import { createServerSupabase } from '@/lib/supabase/server'

export const metadata = {
  title: 'SOP Library | myaircraft.us',
}

export default async function SopAdminLayout({ children }: { children: ReactNode }) {
  // Admin gate. We re-check is_platform_admin server-side here so the
  // shell can never render for a non-admin even if they navigate
  // directly. Aligned with apps/web/app/(app)/admin/layout.tsx.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/sop-library')

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
    <div className="min-h-screen bg-[#0a0f1c] text-slate-100 flex">
      {/* Left sidebar — dedicated SOP Library shell. */}
      <aside className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <Link href="/sop-library" className="block">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
              myaircraft
            </div>
            <div className="text-base font-semibold text-white">admin</div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link
            href="/sop-library"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white bg-slate-800/60 hover:bg-slate-800 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            <span>SOP Library</span>
          </Link>
          <div
            aria-disabled
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-500 cursor-not-allowed"
            title="Coming soon"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Investor Room</span>
            <span className="ml-auto text-[9px] uppercase tracking-wider bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
              Soon
            </span>
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-slate-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to app
          </Link>
        </div>
      </aside>

      {/* Right pane: top bar + content. */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-slate-800 bg-[#0f172a]/70 backdrop-blur flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              Admin
            </span>
            <span className="text-xs text-slate-400">SOP Library</span>
          </div>
          <div className="text-xs text-slate-400 truncate max-w-[40ch]">{userLabel}</div>
        </header>

        <main className="flex-1 overflow-auto bg-[#0a0f1c]">{children}</main>
      </div>
    </div>
  )
}
