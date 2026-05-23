/**
 * Per-vendor scraper module contract.
 *
 * A scraper is given a login + password and returns a list of
 * per-aircraft tach hours (and last-flight dates). The orchestrator
 * (lib/agents/impl/data-sync-tach-time-scraper.ts) reconciles those
 * against our aircraft.total_time_hours and emits a recommendation
 * row when the delta is meaningful.
 *
 * Scrapers MUST:
 *   - never throw — return { ok: false, error } instead
 *   - never log the decrypted password
 *   - respect the abort signal (e.g. 60s budget)
 */
export interface ScrapeResult {
  ok: boolean
  /** Per-aircraft tach reading scraped from the vendor's UI. */
  aircraft?: Array<{
    tail_number: string
    total_time_hours: number | null
    last_flight_at: string | null // ISO
    /** Anything else the vendor showed (make/model/year) so we can add
     *  the aircraft if it doesn't yet exist on our side. */
    make?: string | null
    model?: string | null
    year?: number | null
  }>
  /** Vendor-side timestamp of the scrape, if exposed. */
  scraped_at?: string
  error?: string
  /** Human-readable explanation we surface in the recommendation. */
  note?: string
}

export interface VendorScraper {
  system: string // 'flight_schedule_pro' | ...
  /** A short note shown to the user when they're picking a system. */
  label: string
  scrape: (creds: { login: string; password: string; signal?: AbortSignal }) => Promise<ScrapeResult>
}
