'use client'

/**
 * useNotifications() — client hook for the bell + dropdown (Spec 0.4).
 *
 * Polls /api/notifications every 60s. Exposes:
 *   - notifications: in-app deliveries (Spec 0.4 hides email/push/SMS rows
 *     in the bell — they're already delivered through the channel; the bell
 *     is only the in-app surface).
 *   - unreadCount
 *   - markRead / markAllRead
 *
 * Future sprint: swap polling for a Supabase realtime subscription on
 * `notifications WHERE user_id = auth.uid()`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Notification } from './types'

const POLL_INTERVAL_MS = 60_000

export interface UseNotificationsResult {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?channel=in-app&limit=50', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const payload = await res.json()
      if (cancelledRef.current) return
      setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : [])
    } catch {
      // noop — keep previous state on transient errors
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(interval)
    }
  }, [refresh])

  const markRead = useCallback(async (id: string) => {
    const prev = notifications
    setNotifications((ns) =>
      ns.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    )
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(prev)
      toast.error('Could not mark as read')
    }
  }, [notifications])

  const markAllRead = useCallback(async () => {
    const prev = notifications
    const stamp = new Date().toISOString()
    setNotifications((ns) => ns.map((n) => (n.read_at ? n : { ...n, read_at: stamp })))
    try {
      const res = await fetch(`/api/notifications/mark-all-read`, { method: 'POST' })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(prev)
      toast.error('Could not mark all as read')
    }
  }, [notifications])

  const dismiss = useCallback(async (id: string) => {
    const prev = notifications
    setNotifications((ns) => ns.filter((n) => n.id !== id))
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(prev)
      toast.error('Could not dismiss notification')
    }
  }, [notifications])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return { notifications, unreadCount, loading, markRead, markAllRead, dismiss, refresh }
}
