/**
 * Compression trend predictor (Spec 5.3, heuristic).
 *
 * Reads compression-related entries from `maintenance_events` (the only
 * surface that holds historical maintenance data today). When/if a
 * dedicated `compression_readings` table lands, swap the source — the
 * caller doesn't need to change.
 *
 * Heuristic: linear regression on the last N (≥3) cylinder readings.
 * If slope is downward and projected to cross 70/80 (replacement
 * threshold per FAR / FAA AC 43.13) within 60 days, fire a prediction.
 *
 * Today the maintenance_events schema doesn't carry structured cylinder
 * fields; this predictor returns insufficientData unless the structured
 * data column ever materializes. The shape is preserved so the cron +
 * UI work without changes once data flows in.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PredictionResult } from './types'

const FAR_REPLACEMENT_THRESHOLD = 70 // /80 — below this is unairworthy

export interface CompressionInput {
  organization_id: string
  aircraft_id: string
}

interface MaintenanceEventRow {
  event_date: string | null
  description: string | null
  raw_text: string | null
  parts_replaced: Record<string, unknown> | null
}

export async function predictCompressionTrend(
  supabase: SupabaseClient,
  input: CompressionInput,
): Promise<PredictionResult> {
  const { data } = await supabase
    .from('maintenance_events')
    .select('event_date, description, raw_text, parts_replaced')
    .eq('organization_id', input.organization_id)
    .eq('aircraft_id', input.aircraft_id)
    .order('event_date', { ascending: false })
    .limit(50)

  const events = (data ?? []) as MaintenanceEventRow[]
  // Look for compression-shaped entries — heuristic regex match.
  const readings = extractCompressionReadings(events)

  if (readings.length < 3) {
    return {
      kind: 'compression-trend',
      headline: 'Insufficient compression-reading history.',
      evidence: [],
      priority: 'low',
      confidence: 0,
      insufficientData: true,
    }
  }

  // Linear regression on (days-from-first, value) pairs per cylinder.
  // Pick the worst-trending cylinder.
  const worst = pickWorstTrendingCylinder(readings)
  if (!worst) {
    return {
      kind: 'compression-trend',
      headline: 'Compression trend stable across all cylinders.',
      evidence: [],
      priority: 'low',
      confidence: 0.5,
    }
  }

  const { cylinder, slopePerDay, lastValue, lastDate } = worst
  if (slopePerDay >= 0) {
    return {
      kind: 'compression-trend',
      headline: `Cylinder #${cylinder} compression stable (${lastValue}/80).`,
      evidence: [`Latest reading ${lastValue}/80 on ${lastDate}.`],
      priority: 'low',
      confidence: 0.7,
    }
  }

  // Days until below FAR_REPLACEMENT_THRESHOLD at current slope.
  const daysToThreshold = Math.ceil((FAR_REPLACEMENT_THRESHOLD - lastValue) / slopePerDay)
  const within60 = daysToThreshold > 0 && daysToThreshold <= 60
  return {
    kind: 'compression-trend',
    headline: within60
      ? `Cylinder #${cylinder} predicted below ${FAR_REPLACEMENT_THRESHOLD}/80 in ~${daysToThreshold} days.`
      : `Cylinder #${cylinder} trending down — ${daysToThreshold} days to FAR threshold.`,
    evidence: [
      `${readings.length} readings analyzed; latest ${lastValue}/80 on ${lastDate}.`,
      `Linear slope: ${slopePerDay.toFixed(3)} pts/day downward.`,
      `FAR replacement threshold: ${FAR_REPLACEMENT_THRESHOLD}/80.`,
    ],
    priority: within60 ? 'high' : 'normal',
    confidence: within60 ? 0.85 : 0.7,
    cta: {
      label: 'Schedule borescope',
      tool: 'create-work-order',
      args: { aircraft_id: input.aircraft_id, scope: `Borescope cylinder #${cylinder} — predicted compression decay` },
    },
  }
}

interface Reading { cylinder: number; value: number; date: string }

function extractCompressionReadings(events: MaintenanceEventRow[]): Reading[] {
  const out: Reading[] = []
  // Pattern: "cyl 3 78/80" / "cylinder 3: 78/80" / "#3 78/80" — case-insensitive.
  const regex = /(?:cyl(?:inder)?|#)\s*(\d{1,2})\s*[:\s]\s*(\d{2,3})\s*\/\s*80/gi
  for (const e of events) {
    const text = `${e.description ?? ''} ${e.raw_text ?? ''}`
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const cyl = parseInt(m[1], 10)
      const val = parseInt(m[2], 10)
      if (!Number.isFinite(cyl) || !Number.isFinite(val) || val < 30 || val > 100) continue
      if (e.event_date) out.push({ cylinder: cyl, value: val, date: e.event_date })
    }
  }
  return out
}

function pickWorstTrendingCylinder(readings: Reading[]):
  | { cylinder: number; slopePerDay: number; lastValue: number; lastDate: string }
  | null {
  const byCyl = new Map<number, Reading[]>()
  for (const r of readings) {
    const arr = byCyl.get(r.cylinder) ?? []
    arr.push(r)
    byCyl.set(r.cylinder, arr)
  }
  let worst: { cylinder: number; slopePerDay: number; lastValue: number; lastDate: string } | null = null
  for (const [cyl, arr] of byCyl.entries()) {
    if (arr.length < 3) continue
    const sorted = arr.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    const t0 = Date.parse(sorted[0].date)
    const xs = sorted.map((r) => (Date.parse(r.date) - t0) / (24 * 60 * 60 * 1000)) // days
    const ys = sorted.map((r) => r.value)
    const slope = linearSlope(xs, ys)
    const last = sorted[sorted.length - 1]
    if (worst === null || slope < worst.slopePerDay) {
      worst = { cylinder: cyl, slopePerDay: slope, lastValue: last.value, lastDate: last.date }
    }
  }
  return worst
}

function linearSlope(xs: number[], ys: number[]): number {
  const n = xs.length
  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  return den > 0 ? num / den : 0
}
