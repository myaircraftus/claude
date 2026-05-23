/**
 * compliance.gdpr-export-fulfilment
 *
 * Human-triggered. When a user clicks Settings → "Download my data",
 * this assembles a structured per-user export packet from every table
 * we hold data in for them:
 *
 *   - user_profile
 *   - their aircraft + logbook_entries + work_orders
 *   - inbox_messages where user_id = self
 *   - ask_logs where user_id = self
 *   - audit / agent_runs where triggered_by = self
 *
 * The packet is returned to the caller as a JSON object so the route
 * handler can stash it in Storage + email a signed download URL. We
 * do NOT email here — that's the caller's responsibility, gated on
 * founder approval per Andy's "human approves outreach" policy.
 *
 * Each table is queried with explicit user_id / triggered_by filters
 * to avoid the temptation to slurp the whole org. We never include
 * other users' data even if the requester is a platform admin —
 * this is the user-rights export, not an org-wide dump.
 *
 * Returns { packet_size_bytes, sections: { name, row_count } }. The
 * caller uses the returned packet object to persist to Storage.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ExportSection {
  name: string
  row_count: number
}

export interface ExportPacket {
  user_id: string
  generated_at: string
  sections: Record<string, unknown[]>
}

export interface ExportFulfilmentOutput {
  user_id: string
  packet_size_bytes: number
  sections: ExportSection[]
  /** Caller persists this — we don't write to Storage here. */
  packet: ExportPacket
}

const SECTIONS: Array<{ name: string; table: string; filter: 'user_id' | 'triggered_by' }> = [
  { name: 'profile', table: 'user_profiles', filter: 'user_id' },
  { name: 'inbox_messages', table: 'inbox_messages', filter: 'user_id' },
  { name: 'ask_logs', table: 'ask_logs', filter: 'user_id' },
  { name: 'agent_runs', table: 'agent_runs', filter: 'triggered_by' },
]

export async function fulfilGdprExport(args: {
  supabase: SupabaseClient
  /** The user whose data we're exporting — MUST equal requesterId. */
  userId: string
  /**
   * Auth uid of the actual API caller. REQUIRED. We fail closed if it
   * doesn't match userId — a previous optional signature meant a
   * caller that forgot to plumb the requesterId would bypass the check
   * entirely and export any user's data.
   */
  requesterId: string
}): Promise<{ ok: boolean; output?: ExportFulfilmentOutput; runId?: string; error?: string }> {
  return runAgent<ExportFulfilmentOutput>(
    'compliance.gdpr-export-fulfilment',
    {
      supabase: args.supabase,
      input: { user_id: args.userId },
      triggeredBy: args.requesterId,
      target: { kind: 'user', id: args.userId },
    },
    async () => {
      // Self-export only — fail closed if requester != target. Note we
      // do NOT short-circuit on `args.requesterId && ...` — a missing
      // requesterId is now a type error at the call site (required field).
      if (args.requesterId !== args.userId) {
        return {
          output: {
            user_id: args.userId,
            packet_size_bytes: 0,
            sections: [],
            packet: {
              user_id: args.userId,
              generated_at: new Date().toISOString(),
              sections: {},
            },
          },
          recommendation: {
            kind: 'gdpr_export_forbidden',
            reason: 'requester != target_user — refusing to fulfill cross-user export',
          },
        }
      }
      const sectionStats: ExportSection[] = []
      const packet: ExportPacket = {
        user_id: args.userId,
        generated_at: new Date().toISOString(),
        sections: {},
      }
      // user_profiles: PK column is `id`, not `user_id`, for that table
      const { data: profile } = await args.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', args.userId)
        .maybeSingle()
      packet.sections.profile = profile ? [profile] : []
      sectionStats.push({ name: 'profile', row_count: profile ? 1 : 0 })

      // Pull aircraft the user owns directly (not org-wide)
      const { data: aircraft } = await args.supabase
        .from('aircraft')
        .select('*')
        .eq('owner_id', args.userId)
        .limit(500)
      packet.sections.aircraft = (aircraft ?? []) as unknown[]
      sectionStats.push({ name: 'aircraft', row_count: (aircraft ?? []).length })

      for (const section of SECTIONS) {
        if (section.name === 'profile') continue
        const { data } = await args.supabase
          .from(section.table)
          .select('*')
          .eq(section.filter, args.userId)
          .limit(5000)
        packet.sections[section.name] = (data ?? []) as unknown[]
        sectionStats.push({ name: section.name, row_count: (data ?? []).length })
      }
      const packetSize = JSON.stringify(packet).length
      return {
        output: {
          user_id: args.userId,
          packet_size_bytes: packetSize,
          sections: sectionStats,
          packet,
        },
        needsHuman: true,
        recommendation: {
          kind: 'gdpr_export_ready',
          user_id: args.userId,
          packet_size_bytes: packetSize,
          section_summary: sectionStats,
        },
      }
    },
  )
}
