import Link from 'next/link'

/**
 * Global 404. Next.js App Router renders this for any URL with no matching
 * route segment — replacing the previous behaviour where unrecognized paths
 * silently fell through to the Dashboard.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-2 text-7xl font-bold tabular-nums text-muted-foreground/30">404</div>
      <h1 className="mb-2 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">
        This page doesn&apos;t exist or hasn&apos;t been built yet. Head back to
        your dashboard to continue.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
