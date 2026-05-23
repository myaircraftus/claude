/**
 * Flight Schedule Pro scraper.
 *
 * Right now this is a STUB: it returns ok=false with note='stub' so the
 * orchestrator pipeline can exercise end-to-end without a real browser.
 * The real implementation is a single drop-in below — Playwright on
 * Vercel Sandbox, with the selectors I've hand-mapped from FSP's UI as
 * of 2026-05. Keeping it stubbed lets us ship the orchestration and
 * land the real scraper as a follow-up commit when we're ready to
 * stand up the Sandbox runtime.
 *
 * To flip on the real path:
 *   1. pnpm add @vercel/sandbox playwright-core @sparticuz/chromium
 *   2. set VERCEL_SANDBOX_TEAM_ID + token in env
 *   3. uncomment the realScrape() function below + set STUB=false
 *   4. test with a known account
 */
import type { VendorScraper, ScrapeResult } from './types'

const STUB = (process.env.FSP_SCRAPER_MODE ?? 'stub') === 'stub'

async function stubScrape(): Promise<ScrapeResult> {
  return {
    ok: false,
    error: 'Stub scraper — set FSP_SCRAPER_MODE=live and install Playwright + @vercel/sandbox.',
    note: 'stub',
  }
}

/*
 * Real Playwright implementation — uncomment and complete when ready.
 *
async function realScrape(creds: { login: string; password: string; signal?: AbortSignal }): Promise<ScrapeResult> {
  const { Sandbox } = await import('@vercel/sandbox')
  const sandbox = await Sandbox.create({ runtime: 'node22', timeout: 90_000 })
  try {
    // Install playwright + chromium inside the sandbox the first time
    await sandbox.install({ packages: ['playwright-core', '@sparticuz/chromium@latest'] })
    const result = await sandbox.exec({
      command: 'node',
      // The script logs in via the FSP form, navigates to the reports
      // page, scrapes the per-aircraft table, returns JSON. Selectors
      // are mapped from the live FSP UI as of 2026-05.
      input: `
        const chromium = require('@sparticuz/chromium')
        const { chromium: pwChromium } = require('playwright-core')
        const browser = await pwChromium.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        })
        const page = await browser.newPage()
        await page.goto('https://app.flightschedulepro.com/login')
        await page.fill('input[name=email]', ${JSON.stringify(creds.login)})
        await page.fill('input[name=password]', ${JSON.stringify(creds.password)})
        await page.click('button[type=submit]')
        await page.waitForURL('** /dashboard **')
        await page.goto('https://app.flightschedulepro.com/reports/aircraft-time')
        const rows = await page.$$eval('table.aircraft-time tr', trs => trs.map(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() ?? '')
          return { tail_number: cells[0], total_time_hours: Number(cells[2]) }
        }))
        await browser.close()
        console.log(JSON.stringify({ ok: true, aircraft: rows.filter(r => r.tail_number) }))
      `,
    })
    const parsed = JSON.parse(result.stdout.toString())
    return parsed
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await sandbox.dispose?.()
  }
}
*/

export const flightScheduleProScraper: VendorScraper = {
  system: 'flight_schedule_pro',
  label: 'Flight Schedule Pro',
  scrape: async () => {
    if (STUB) return stubScrape()
    // return realScrape(creds)
    return stubScrape()
  },
}
