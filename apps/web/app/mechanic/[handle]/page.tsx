import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/

export default async function MechanicPublicProfilePage({
  params,
}: {
  params: { handle: string }
}) {
  const handle = (params.handle || '').toLowerCase()
  if (!HANDLE_RE.test(handle)) notFound()

  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('id, full_name, avatar_url, job_title, handle, persona')
    .eq('handle', handle)
    .maybeSingle()

  if (!profile) notFound()

  const displayName = profile.full_name || profile.handle
  const initials = (displayName || 'U')
    .split(/\s+/)
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full bg-card border border-border rounded-2xl shadow-sm p-8 text-center">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Aircraft Maintenance
        </div>

        <div className="mx-auto mb-4 w-24 h-24 rounded-full bg-muted overflow-hidden flex items-center justify-center ring-4 ring-background shadow-sm">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground">{initials}</span>
          )}
        </div>

        <h1 className="text-2xl font-semibold text-foreground">{displayName}</h1>
        {profile.job_title ? (
          <p className="text-sm text-muted-foreground mt-1">{profile.job_title}</p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-4">
          myaircraft.us/mechanic/{profile.handle}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/signup?ref=mechanic/${profile.handle}`}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Request service
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/40"
          >
            About myaircraft
          </Link>
        </div>

        <p className="text-[11px] text-muted-foreground mt-8">
          Powered by myaircraft — coordination for owners and maintenance shops.
        </p>
      </div>
    </main>
  )
}
