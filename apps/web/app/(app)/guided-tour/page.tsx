import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { Sparkles } from 'lucide-react'

export const metadata = { title: 'Guided Tour' }

export default async function GuidedTourPage() {
  const { profile } = await requireAppServerSession()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Guided Tour' }]} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-[24px] text-slate-900 mb-2" style={{ fontWeight: 700 }}>
            Guided Tour
          </h1>
          <p className="text-slate-600 text-[14px] mb-1">Coming soon.</p>
          <p className="text-slate-500 text-[13px]">
            An interactive walkthrough of every workflow in myaircraft.us.
          </p>
        </div>
      </main>
    </div>
  )
}
