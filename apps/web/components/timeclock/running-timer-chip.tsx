'use client'

/**
 * RunningTimerChip (Spec 2.3) — small Topbar chip shown only when the
 * current user has an open time entry. Clicking the chip navigates to
 * the WO time-clock view; the inline X button stops the clock.
 */

import { Loader2, StopCircle, Timer } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { useTimeClock, formatElapsed } from './use-time-clock'

export function RunningTimerChip() {
  const { openEntry, openWorkOrder, loading, elapsedMs, stop } = useTimeClock()

  return (
    <AnimatePresence>
      {openEntry && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full pl-2 pr-1 py-0.5 text-[11.5px]"
          style={{ fontWeight: 600 }}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Timer className="h-3 w-3" />
          )}
          <Link
            href={openWorkOrder ? `/work-orders/${openWorkOrder.id}/time-clock` : '/time-clock'}
            className="inline-flex items-center gap-1 hover:underline font-mono"
          >
            <span>{formatElapsed(elapsedMs)}</span>
            {openWorkOrder?.work_order_number && (
              <span className="text-emerald-700/80">· {openWorkOrder.work_order_number}</span>
            )}
            {openWorkOrder?.aircraft_tail && (
              <span className="text-emerald-700/80">· {openWorkOrder.aircraft_tail}</span>
            )}
          </Link>
          <button
            onClick={() => stop()}
            title="Clock out"
            className="ml-0.5 p-0.5 rounded-full hover:bg-emerald-100"
          >
            <StopCircle className="h-3 w-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
