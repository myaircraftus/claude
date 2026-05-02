'use client'

/**
 * ListView (Spec 2.4) — flexible vertical list. Hands each row to a
 * caller-provided renderer; the multi-view system stays decoupled from
 * any specific module's row design.
 */

import type { ReactNode } from 'react'
import type { ModuleViewConfig } from '@/lib/views/configs'

export function ListView<T extends { id: string }>({
  rows,
  config: _config,
  renderRow,
}: {
  rows: T[]
  config: ModuleViewConfig
  renderRow: (row: T) => ReactNode
}) {
  if (rows.length === 0) {
    return null   // empty state handled by the shell
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id}>{renderRow(row)}</li>
      ))}
    </ul>
  )
}
