/**
 * data-sync.tach-time-scraper
 *
 * Daily cron. For every row in external_system_credentials:
 *   1. decrypt the password
 *   2. call the matching vendor scraper
 *   3. for each aircraft in the scrape result:
 *      - find the matching aircraft row in our DB by tail_number
 *      - if found and tach hours differ from what we have → emit a
 *        'tach_time_delta' recommendation; the user approves in the
 *        admin/agents page
 *      - if NOT found and the scrape included make/model/year →
 *        emit a 'proposed_new_aircraft' recommendation
 *
 * Never writes the aircraft table directly. Everything goes through
 * agent_runs.recommendation → human approval → commit. The user is in
 * the loop because tach hours feed into compliance (annual / 100-hr
 * due dates) and we don't want to silently shift those.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { decryptCredential } from '@/lib/security/envelope-crypt'
import { getScraper } from '../scrapers'

export interface TachSyncReport {
  scanned_credentials: number
  scrape_successes: number
  scrape_failures: number
  deltas: number
  proposed_new_aircraft: number
  notes: string[]
}

export async function syncTachTime(args: {
  supabase: SupabaseClient
  /** Limit to a single user_id for ad-hoc / debug runs. */
  userId?: string
}): Promise<{ ok: boolean; output?: TachSyncReport; runId?: string; error?: string }> {
  return runAgent<TachSyncReport>(
    'data-sync.tach-time-scraper',
    {
      supabase: args.supabase,
      input: { user_filter: args.userId ?? null },
    },
    async (logger) => {
      const report: TachSyncReport = {
        scanned_credentials: 0,
        scrape_successes: 0,
        scrape_failures: 0,
        deltas: 0,
        proposed_new_aircraft: 0,
        notes: [],
      }

      // 1. Pull credentials. NEVER select password_encrypted into a log,
      // recommendation, or output — only into local var.
      let q = args.supabase
        .from('external_system_credentials')
        .select('id, user_id, organization_id, system, login_email, password_encrypted, password_iv')
        .eq('scrape_disabled', false)
      if (args.userId) q = q.eq('user_id', args.userId)
      const { data: creds, error: credsErr } = await q
      if (credsErr) {
        return { output: report, recommendation: { kind: 'sync_failed', reason: credsErr.message } }
      }
      report.scanned_credentials = (creds ?? []).length

      const deltas: Array<{
        user_id: string
        aircraft_id: string
        tail_number: string
        current_hours: number | null
        scraped_hours: number
        system: string
      }> = []
      const proposals: Array<{
        user_id: string
        tail_number: string
        make: string | null
        model: string | null
        year: number | null
        scraped_hours: number | null
        system: string
      }> = []

      for (const row of creds ?? []) {
        const scraper = getScraper(row.system)
        if (!scraper) {
          report.notes.push(`No scraper module for system=${row.system}`)
          continue
        }

        let plaintext: string
        try {
          plaintext = decryptCredential(
            Buffer.from(row.password_encrypted as unknown as Buffer),
            Buffer.from(row.password_iv as unknown as Buffer),
          )
        } catch (e) {
          await args.supabase
            .from('external_system_credentials')
            .update({ last_error: 'decrypt_failed' })
            .eq('id', row.id)
          report.scrape_failures += 1
          continue
        }

        const result = await scraper.scrape({
          login: row.login_email,
          password: plaintext,
        })
        // Drop the plaintext as soon as the call returns
        plaintext = ''

        if (!result.ok) {
          report.scrape_failures += 1
          report.notes.push(`${row.system}: ${result.error ?? 'unknown'}`)
          await args.supabase
            .from('external_system_credentials')
            .update({ last_error: result.error ?? null })
            .eq('id', row.id)
          continue
        }

        report.scrape_successes += 1
        await args.supabase
          .from('external_system_credentials')
          .update({
            last_synced_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', row.id)

        // Match scrape rows to our aircraft. Per-user scoping —
        // owners only get aircraft they own; admins can see all.
        const tails = (result.aircraft ?? [])
          .map((a) => a.tail_number?.toUpperCase().trim())
          .filter((t): t is string => !!t)
        if (tails.length === 0) continue

        const { data: ourAircraft } = await args.supabase
          .from('aircraft')
          .select('id, tail_number, total_time_hours, organization_id')
          .in('tail_number', tails)
          .eq('organization_id', row.organization_id ?? '')
        const byTail = new Map(
          (ourAircraft ?? []).map((a: any) => [
            (a.tail_number as string).toUpperCase(),
            a,
          ]),
        )

        for (const scraped of result.aircraft ?? []) {
          const tn = scraped.tail_number?.toUpperCase().trim()
          if (!tn || scraped.total_time_hours == null) continue
          const ours = byTail.get(tn)
          if (!ours) {
            proposals.push({
              user_id: row.user_id,
              tail_number: tn,
              make: scraped.make ?? null,
              model: scraped.model ?? null,
              year: scraped.year ?? null,
              scraped_hours: scraped.total_time_hours,
              system: row.system,
            })
            continue
          }
          // Delta threshold: only report when off by ≥0.1h to avoid noise.
          if (
            ours.total_time_hours == null ||
            Math.abs(Number(ours.total_time_hours) - scraped.total_time_hours) >= 0.1
          ) {
            deltas.push({
              user_id: row.user_id,
              aircraft_id: ours.id as string,
              tail_number: tn,
              current_hours: ours.total_time_hours == null ? null : Number(ours.total_time_hours),
              scraped_hours: scraped.total_time_hours,
              system: row.system,
            })
          }
        }
      }

      report.deltas = deltas.length
      report.proposed_new_aircraft = proposals.length
      void logger // satisfy lint when no model is used

      return {
        output: report,
        recommendation:
          deltas.length + proposals.length > 0
            ? {
                kind: 'tach_time_review',
                deltas,
                proposed_new_aircraft: proposals,
              }
            : null,
      }
    },
  )
}
