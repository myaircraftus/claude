'use client'

/**
 * ProceduresPage view (Spec 1.3) — list of procedure templates.
 * Mechanic+ can create + delete (archive) inline.
 */

import { useEffect, useState } from 'react'
import { Plus, FileText, Loader2, ChevronRight, Tag } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { ProcedureBuilder } from './procedure-builder'
import type { Procedure, ProcedureSection, ProcedureItem, OrgRole } from '@/types'

type Full = Procedure & { sections: Array<ProcedureSection & { items: ProcedureItem[] }> }

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

export function ProceduresView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [procedures, setProcedures] = useState<Full[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/procedures', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setProcedures((payload.procedures ?? []) as Full[])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function archive(id: string, name: string) {
    if (!confirm(`Archive procedure "${name}"? Existing inspections that used it will keep working.`)) return
    try {
      const res = await fetch(`/api/procedures/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Could not archive')
        return
      }
      toast.success('Archived')
      load()
    } catch {
      toast.error('Could not archive')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Procedures
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Reusable inspection templates. Sections + checklist items with input
            types (check, pass/fail, value, photo, signature) and FAR / manual
            references.
          </p>
        </div>
        {canMutate && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New procedure
          </Button>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <ProcedureBuilder
              onCancel={() => setCreating(false)}
              onSaved={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : procedures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            No procedures yet
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            Create your first template — most shops start with "Annual Inspection"
            and "100-Hour" templates.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {procedures.map((p) => {
              const itemCount = p.sections.reduce((n, s) => n + s.items.length, 0)
              return (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-white rounded-2xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <Link href={`/procedures/${p.id}`} className="flex items-center gap-3 p-4 group">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{p.name}</h3>
                      </div>
                      {p.description && (
                        <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
                      )}
                      <div className="text-[11.5px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{p.sections.length} section{p.sections.length === 1 ? '' : 's'}</span>
                        <span aria-hidden>·</span>
                        <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                        {p.applies_to.length > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Tag className="h-2.5 w-2.5" />
                              {p.applies_to.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  {canMutate && (
                    <div className="px-4 py-2 border-t border-border flex justify-end">
                      <button
                        onClick={() => archive(p.id, p.name)}
                        className="text-[11px] text-muted-foreground hover:text-rose-600"
                        style={{ fontWeight: 500 }}
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
