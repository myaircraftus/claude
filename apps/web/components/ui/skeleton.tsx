import { cn } from '@/lib/utils'

/**
 * Skeleton — a subtle pulsing placeholder used while content loads.
 * Standard shadcn-style primitive (the UI kit was missing one, so every
 * surface improvised "Loading…" text instead). Compose by sizing via
 * className, e.g. <Skeleton className="h-4 w-24" />.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}
