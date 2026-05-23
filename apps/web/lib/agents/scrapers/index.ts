/**
 * Vendor scraper registry. Add a new vendor by importing its scraper
 * here. The orchestrator agent fetches the right scraper by system id.
 */
import type { VendorScraper } from './types'
import { flightScheduleProScraper } from './flight-schedule-pro'

const SCRAPERS: Record<string, VendorScraper> = {
  flight_schedule_pro: flightScheduleProScraper,
  // flight_circle: ...
  // shop_monkey: ...
}

export function getScraper(system: string): VendorScraper | null {
  return SCRAPERS[system] ?? null
}

export function listScrapers(): VendorScraper[] {
  return Object.values(SCRAPERS)
}

export type { VendorScraper, ScrapeResult } from './types'
