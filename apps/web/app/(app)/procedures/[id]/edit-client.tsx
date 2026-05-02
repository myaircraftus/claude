'use client'

import { useTenantRouter } from '@/components/shared/tenant-link'
import { ProcedureBuilder } from '@/components/inspections/procedure-builder'
import type { Procedure, ProcedureSection, ProcedureItem } from '@/types'

type Full = Procedure & { sections: Array<ProcedureSection & { items: ProcedureItem[] }> }

export function ProcedureEditClient({ initialProcedure }: { initialProcedure: Full }) {
  const router = useTenantRouter()
  return (
    <ProcedureBuilder
      initial={initialProcedure}
      onCancel={() => router.push('/procedures')}
      onSaved={() => router.push('/procedures')}
    />
  )
}
