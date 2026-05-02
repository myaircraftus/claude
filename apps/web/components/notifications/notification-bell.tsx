'use client'

/**
 * NotificationBell — header bell + dropdown (Spec 0.4).
 *
 * Replaces the placeholder Bell icon in Topbar. Shows a red badge with
 * unread count and a popover listing the most recent in-app
 * notifications. Click a notification → mark read + navigate to its link.
 */

import { useState } from 'react'
import { Bell, Inbox, Check, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotifications } from '@/lib/notifications/use-notifications'
import { cn } from '@/lib/utils'

const RELATIVE_TIME = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, dismiss } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground" title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center"
              style={{ fontWeight: 700 }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[360px] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span
                className="text-[10px] uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full"
                style={{ fontWeight: 700 }}
              >
                {unreadCount} unread
              </span>
            )}
          </div>
          <button
            onClick={() => markAllRead()}
            disabled={unreadCount === 0}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center mb-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-[12px] text-muted-foreground">
                You're all caught up.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              <AnimatePresence>
                {notifications.map((n) => {
                  const unread = !n.read_at
                  return (
                    <motion.li
                      key={n.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.12 }}
                      className={cn(
                        'group relative flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors',
                        unread && 'bg-blue-50/50',
                      )}
                    >
                      {unread && (
                        <span
                          className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                          aria-hidden
                        />
                      )}

                      <div
                        onClick={async () => {
                          if (unread) await markRead(n.id)
                          if (n.link) {
                            setOpen(false)
                            // Tenant-aware navigation handled by Link below;
                            // for the no-link case we just mark read.
                          }
                        }}
                        className={cn(
                          'flex-1 min-w-0',
                          n.link ? 'cursor-pointer' : '',
                          !unread && 'pl-3',
                        )}
                      >
                        {n.link ? (
                          <Link href={n.link} onClick={() => setOpen(false)}>
                            <NotificationBody n={n} />
                          </Link>
                        ) : (
                          <NotificationBody n={n} />
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {unread && (
                          <button
                            onClick={() => markRead(n.id)}
                            title="Mark read"
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => dismiss(n.id)}
                          title="Dismiss"
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border bg-muted/20">
          <Link
            href="/settings/notifications"
            onClick={() => setOpen(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            style={{ fontWeight: 500 }}
          >
            Notification preferences →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationBody({
  n,
}: {
  n: { title: string; body: string; sent_at: string; category: string }
}) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>
          {n.title}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80" style={{ fontWeight: 600 }}>
          {n.category}
        </span>
      </div>
      <p className="text-[11.5px] text-muted-foreground mt-0.5 line-clamp-2">
        {n.body}
      </p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
        {RELATIVE_TIME(n.sent_at)}
      </p>
    </div>
  )
}
