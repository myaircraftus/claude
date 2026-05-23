/**
 * Flight Schedule Pro scraper.
 *
 * Two execution modes, gated by FSP_SCRAPER_MODE:
 *   - 'stub' (default): returns ok=false with note='stub' so the
 *     orchestrator can dry-run without a browser.
 *   - 'live': spins up a Vercel Sandbox, installs Playwright +
 *     @sparticuz/chromium, logs into FSP, scrapes the per-aircraft
 *     time-tracking table, returns parsed rows.
 *
 * @vercel/sandbox + playwright-core + @sparticuz/chromium are imported
 * dynamically — keeps the heavy deps out of the cold-start bundle for
 * all the routes that DON'T touch the scraper.
 *
 * Selectors hand-mapped from FSP's UI as of 2026-05; if the page
 * structure changes, the script falls through to ok=false with a
 * parseable error rather than throwing.
 */
import type { VendorScraper, ScrapeResult } from './types'

const MODE = (process.env.FSP_SCRAPER_MODE ?? 'stub').toLowerCase()

async function stubScrape(): Promise<ScrapeResult> {
  return {
    ok: false,
    error: 'Stub scraper — set FSP_SCRAPER_MODE=live to activate the Playwright path.',
    note: 'stub',
  }
}

/**
 * Compose the script the Sandbox runs. Login + password are
 * `JSON.stringify`'d into the source so they survive escape boundaries
 * cleanly; the sandbox process is destroyed at the end of every call
 * so they never persist anywhere.
 */
function buildSandboxScript(creds: { login: string; password: string }): string {
  return `
    const chromium = require('@sparticuz/chromium')
    const { chromium: pwChromium } = require('playwright-core')

    async function main() {
      const browser = await pwChromium.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      })
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const page = await ctx.newPage()
      page.setDefaultTimeout(20000)
      try {
        await page.goto('https://app.flightschedulepro.com/login', { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('input[name=email]')
        await page.fill('input[name=email]', ${JSON.stringify(creds.login)})
        await page.fill('input[name=password]', ${JSON.stringify(creds.password)})
        await Promise.all([
          page.waitForURL(/dashboard|home|schedule/i, { timeout: 25000 }),
          page.click('button[type=submit]'),
        ])
        await page.goto('https://app.flightschedulepro.com/reports/aircraft-time', { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('table', { timeout: 20000 })
        const aircraft = await page.$$eval('table tbody tr', (trs) =>
          trs
            .map((tr) => {
              const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
              const tail = cells[0] || null
              const total = cells.find((c) => /^[\\d.,]+$/.test(c))
              return tail ? { tail_number: tail, total_time_hours: total ? Number(total.replace(/,/g, '')) : null } : null
            })
            .filter(Boolean)
        )
        console.log(JSON.stringify({ ok: true, aircraft, scraped_at: new Date().toISOString() }))
      } catch (e) {
        console.log(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 400) }))
      } finally {
        await browser.close()
      }
    }
    main().catch((e) => {
      console.log(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 400) }))
    })
  `
}

async function realScrape(creds: {
  login: string
  password: string
  signal?: AbortSignal
}): Promise<ScrapeResult> {
  let SandboxMod: { Sandbox: { create: (...args: unknown[]) => Promise<unknown> } }
  try {
    SandboxMod = (await import('@vercel/sandbox')) as unknown as typeof SandboxMod
  } catch (e) {
    return {
      ok: false,
      error: `@vercel/sandbox not available: ${(e as Error).message.slice(0, 200)}`,
      note: 'sandbox_unavailable',
    }
  }
  const { Sandbox } = SandboxMod

  type SandboxLike = {
    install: (args: { packages: string[] }) => Promise<{ exitCode?: number } | unknown>
    exec: (args: { command: string; input?: string; timeout?: number }) => Promise<{ stdout?: unknown }>
    dispose?: () => Promise<void>
  }

  let sandbox: SandboxLike | null = null
  try {
    sandbox = (await Sandbox.create({ runtime: 'node22', timeout: 120_000 })) as SandboxLike
    const installRes = (await sandbox.install({
      packages: ['playwright-core@1.60.0', '@sparticuz/chromium@148.0.0'],
    })) as { exitCode?: number } | undefined
    if (installRes && typeof installRes.exitCode === 'number' && installRes.exitCode !== 0) {
      return {
        ok: false,
        error: 'Sandbox install of playwright-core / chromium failed',
        note: 'install_failed',
      }
    }
    const script = buildSandboxScript({ login: creds.login, password: creds.password })
    const result = await sandbox.exec({
      command: 'node',
      input: script,
      timeout: 90_000,
    })
    const stdout = String(result.stdout ?? '').trim()
    if (!stdout) {
      return { ok: false, error: 'Sandbox produced no output', note: 'empty_stdout' }
    }
    try {
      return JSON.parse(stdout) as ScrapeResult
    } catch {
      return {
        ok: false,
        error: `Sandbox stdout was not JSON: ${stdout.slice(0, 200)}`,
        note: 'parse_failed',
      }
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      note: 'sandbox_error',
    }
  } finally {
    try {
      if (sandbox?.dispose) await sandbox.dispose()
    } catch {
      // ignore
    }
  }
}

export const flightScheduleProScraper: VendorScraper = {
  system: 'flight_schedule_pro',
  label: 'Flight Schedule Pro',
  scrape: async (creds) => {
    if (MODE === 'live') return realScrape(creds)
    return stubScrape()
  },
}
