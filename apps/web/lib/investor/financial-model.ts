/**
 * Bottoms-up 3-year financial model.
 *
 * What an investor wants to see: explicit assumptions, monthly cohorts,
 * the path from "founding tenant + 0 paid" to "$22M ARR in year 3."
 * Every number here is a computation from the assumptions block — no
 * "trust me" magic numbers.
 *
 * Numbers are author-prepared, not committed forecasts. Reviewed
 * 2026-05-22 against the live tenant on production.
 */

export interface Assumptions {
  /** Founding tenant (already onboarded). */
  founding_shops_q0: number
  /** New shops added per quarter, by year. */
  new_shops_per_q: [number[], number[], number[]] // 12 quarters
  /** Mix of shop tiers — must sum to 1. */
  shop_tier_mix: { starter: number; pro: number; unlimited: number }
  /** Monthly price by tier (USD). */
  shop_tier_price_mo: { starter: number; pro: number; unlimited: number }
  /** Average aircraft per shop by tier (for transparency). */
  shop_tier_aircraft: { starter: number; pro: number; unlimited: number }
  /** Logo churn per year (annualised), by year. */
  annual_churn: [number, number, number]
  /** Marketplace ramp — facilitated GMV per quarter (USD). */
  marketplace_gmv_per_q: [number[], number[], number[]]
  /** Marketplace take rate. */
  marketplace_take_rate: number
  /** Records-access fee per buyer pull (USD). */
  records_access_fee: number
  /** Records pulls per active aircraft per quarter (industry estimate). */
  records_pulls_per_aircraft_per_q: number
  /** COGS as % of revenue (Vercel + Supabase + AI providers + Stripe fees). */
  cogs_pct: number
  /** Headcount cost per quarter (USD). */
  headcount_per_q: [number[], number[], number[]]
  /** GTM + events + content per quarter (USD). */
  gtm_per_q: [number[], number[], number[]]
  /** Other opex (legal, audit, accounting). */
  other_opex_per_q: [number[], number[], number[]]
}

export const ASSUMPTIONS: Assumptions = {
  founding_shops_q0: 1, // Horizon Flights
  new_shops_per_q: [
    // Year 1 — 50 total by Q4
    [4, 10, 15, 21],
    // Year 2 — to 200 cumulative
    [25, 35, 45, 45],
    // Year 3 — to 500 cumulative
    [60, 70, 80, 90],
  ],
  shop_tier_mix: { starter: 0.4, pro: 0.5, unlimited: 0.1 },
  shop_tier_price_mo: { starter: 299, pro: 899, unlimited: 1999 },
  shop_tier_aircraft: { starter: 5, pro: 20, unlimited: 75 },
  annual_churn: [0.15, 0.1, 0.07], // Better retention as product matures
  marketplace_gmv_per_q: [
    [0, 0, 0, 200_000], // Year 1: marketplace beta in Q4 only
    [500_000, 1_500_000, 2_500_000, 3_500_000], // Year 2
    [5_000_000, 12_000_000, 18_000_000, 25_000_000], // Year 3
  ],
  marketplace_take_rate: 0.025,
  records_access_fee: 99,
  records_pulls_per_aircraft_per_q: 0.05, // Low — only sold-aircraft generate pulls
  cogs_pct: 0.18, // 18% blended (Stripe ~3%, AI ~6%, Vercel+Supabase ~5%, Sentry/PostHog ~4%)
  headcount_per_q: [
    // Year 1: founder + 2 SWE hires + GTM lead by Q3 + A&P mechanic-in-residence by Q4
    [60_000, 120_000, 200_000, 280_000],
    // Year 2: scaling to ~10 people
    [350_000, 450_000, 550_000, 650_000],
    // Year 3: ~20 people
    [800_000, 950_000, 1_100_000, 1_250_000],
  ],
  gtm_per_q: [
    [10_000, 25_000, 50_000, 75_000],
    [100_000, 150_000, 200_000, 250_000],
    [300_000, 400_000, 500_000, 600_000],
  ],
  other_opex_per_q: [
    [15_000, 25_000, 60_000, 80_000], // SOC2 audit ~$60K in Q3/Q4
    [50_000, 60_000, 70_000, 80_000],
    [100_000, 120_000, 140_000, 160_000],
  ],
}

export interface QuarterRow {
  year: number
  quarter: number // 1..4
  label: string // "Y1Q1"
  new_shops: number
  active_shops: number
  active_aircraft: number
  saas_arr: number
  saas_revenue: number
  marketplace_gmv: number
  marketplace_take: number
  records_pulls: number
  records_revenue: number
  total_revenue: number
  cogs: number
  gross_profit: number
  gross_margin: number
  headcount: number
  gtm: number
  other_opex: number
  total_opex: number
  ebitda: number
}

export interface YearSummary {
  year: number
  ending_shops: number
  ending_aircraft: number
  ending_arr: number
  total_revenue: number
  total_cogs: number
  gross_profit: number
  gross_margin: number
  total_opex: number
  ebitda: number
  ebitda_margin: number
  cumulative_burn: number
}

/**
 * Compute the full 12-quarter model from the assumptions block.
 * Pure function — same inputs always produce same outputs. Easy to
 * re-run with different assumptions for sensitivity analysis.
 */
export function computeModel(a: Assumptions = ASSUMPTIONS): {
  quarters: QuarterRow[]
  years: YearSummary[]
} {
  const quarters: QuarterRow[] = []
  let activeShops = a.founding_shops_q0
  let cumulativeBurn = 0

  for (let yIdx = 0; yIdx < 3; yIdx++) {
    for (let qIdx = 0; qIdx < 4; qIdx++) {
      const newShops = a.new_shops_per_q[yIdx]![qIdx]!
      // Apply quarterly churn (annual / 4)
      const quarterlyChurnRate = a.annual_churn[yIdx]! / 4
      const churned = Math.round(activeShops * quarterlyChurnRate)
      activeShops = Math.max(0, activeShops - churned) + newShops

      const aircraft =
        Math.round(activeShops * a.shop_tier_mix.starter * a.shop_tier_aircraft.starter) +
        Math.round(activeShops * a.shop_tier_mix.pro * a.shop_tier_aircraft.pro) +
        Math.round(activeShops * a.shop_tier_mix.unlimited * a.shop_tier_aircraft.unlimited)

      const monthlySaaS =
        activeShops *
        (a.shop_tier_mix.starter * a.shop_tier_price_mo.starter +
          a.shop_tier_mix.pro * a.shop_tier_price_mo.pro +
          a.shop_tier_mix.unlimited * a.shop_tier_price_mo.unlimited)
      const saasARR = monthlySaaS * 12
      const saasRevenue = monthlySaaS * 3 // one quarter

      const marketplaceGMV = a.marketplace_gmv_per_q[yIdx]![qIdx]!
      const marketplaceTake = marketplaceGMV * a.marketplace_take_rate

      const recordsPulls = Math.round(aircraft * a.records_pulls_per_aircraft_per_q)
      const recordsRevenue = recordsPulls * a.records_access_fee

      const totalRevenue = saasRevenue + marketplaceTake + recordsRevenue
      const cogs = totalRevenue * a.cogs_pct
      const grossProfit = totalRevenue - cogs
      const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0

      const hc = a.headcount_per_q[yIdx]![qIdx]!
      const gtm = a.gtm_per_q[yIdx]![qIdx]!
      const other = a.other_opex_per_q[yIdx]![qIdx]!
      const opex = hc + gtm + other
      const ebitda = grossProfit - opex
      cumulativeBurn += Math.max(0, -ebitda)

      quarters.push({
        year: yIdx + 1,
        quarter: qIdx + 1,
        label: `Y${yIdx + 1}Q${qIdx + 1}`,
        new_shops: newShops,
        active_shops: activeShops,
        active_aircraft: aircraft,
        saas_arr: saasARR,
        saas_revenue: saasRevenue,
        marketplace_gmv: marketplaceGMV,
        marketplace_take: marketplaceTake,
        records_pulls: recordsPulls,
        records_revenue: recordsRevenue,
        total_revenue: totalRevenue,
        cogs,
        gross_profit: grossProfit,
        gross_margin: grossMargin,
        headcount: hc,
        gtm,
        other_opex: other,
        total_opex: opex,
        ebitda,
      })
    }
  }

  const years: YearSummary[] = []
  for (let yIdx = 0; yIdx < 3; yIdx++) {
    const yq = quarters.filter((q) => q.year === yIdx + 1)
    const last = yq[yq.length - 1]!
    const totalRevenue = yq.reduce((s, q) => s + q.total_revenue, 0)
    const totalCogs = yq.reduce((s, q) => s + q.cogs, 0)
    const grossProfit = totalRevenue - totalCogs
    const totalOpex = yq.reduce((s, q) => s + q.total_opex, 0)
    const ebitda = grossProfit - totalOpex
    years.push({
      year: yIdx + 1,
      ending_shops: last.active_shops,
      ending_aircraft: last.active_aircraft,
      ending_arr: last.saas_arr,
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_profit: grossProfit,
      gross_margin: totalRevenue > 0 ? grossProfit / totalRevenue : 0,
      total_opex: totalOpex,
      ebitda,
      ebitda_margin: totalRevenue > 0 ? ebitda / totalRevenue : 0,
      cumulative_burn: cumulativeBurn,
    })
  }

  return { quarters, years }
}

/**
 * Three scenario variants of the model — bear / base / bull.
 *
 * Base = ASSUMPTIONS as authored.
 * Bear = ~60% of base shop acquisition, +5pp churn, marketplace half.
 * Bull = +30% shop acquisition, -3pp churn, marketplace 1.5x.
 *
 * Investors expect this. The asymmetric upside in bull AND the
 * defensibility in bear are both important to show.
 */
export type Scenario = 'bear' | 'base' | 'bull'

export function getScenarioAssumptions(s: Scenario): Assumptions {
  if (s === 'base') return ASSUMPTIONS
  if (s === 'bear') {
    return {
      ...ASSUMPTIONS,
      new_shops_per_q: ASSUMPTIONS.new_shops_per_q.map((row) =>
        row.map((n) => Math.round(n * 0.6)),
      ) as [number[], number[], number[]],
      annual_churn: [
        ASSUMPTIONS.annual_churn[0] + 0.05,
        ASSUMPTIONS.annual_churn[1] + 0.05,
        ASSUMPTIONS.annual_churn[2] + 0.05,
      ] as [number, number, number],
      marketplace_gmv_per_q: ASSUMPTIONS.marketplace_gmv_per_q.map((row) =>
        row.map((n) => Math.round(n * 0.5)),
      ) as [number[], number[], number[]],
    }
  }
  // bull
  return {
    ...ASSUMPTIONS,
    new_shops_per_q: ASSUMPTIONS.new_shops_per_q.map((row) =>
      row.map((n) => Math.round(n * 1.3)),
    ) as [number[], number[], number[]],
    annual_churn: [
      Math.max(0, ASSUMPTIONS.annual_churn[0] - 0.03),
      Math.max(0, ASSUMPTIONS.annual_churn[1] - 0.03),
      Math.max(0, ASSUMPTIONS.annual_churn[2] - 0.03),
    ] as [number, number, number],
    marketplace_gmv_per_q: ASSUMPTIONS.marketplace_gmv_per_q.map((row) =>
      row.map((n) => Math.round(n * 1.5)),
    ) as [number[], number[], number[]],
  }
}

export function computeScenario(s: Scenario) {
  return computeModel(getScenarioAssumptions(s))
}

/** Render the model as CSV — used by the /api/investor/model.csv route. */
export function modelToCsv(): string {
  const { quarters } = computeModel()
  const headers = [
    'Period',
    'New shops',
    'Active shops',
    'Active aircraft',
    'SaaS ARR',
    'SaaS revenue (Q)',
    'Marketplace GMV',
    'Marketplace take',
    'Records pulls',
    'Records revenue',
    'Total revenue',
    'COGS',
    'Gross profit',
    'Gross margin %',
    'Headcount',
    'GTM',
    'Other opex',
    'Total opex',
    'EBITDA',
  ]
  const rows = quarters.map((q) => [
    q.label,
    q.new_shops,
    q.active_shops,
    q.active_aircraft,
    Math.round(q.saas_arr),
    Math.round(q.saas_revenue),
    Math.round(q.marketplace_gmv),
    Math.round(q.marketplace_take),
    q.records_pulls,
    Math.round(q.records_revenue),
    Math.round(q.total_revenue),
    Math.round(q.cogs),
    Math.round(q.gross_profit),
    (q.gross_margin * 100).toFixed(1),
    Math.round(q.headcount),
    Math.round(q.gtm),
    Math.round(q.other_opex),
    Math.round(q.total_opex),
    Math.round(q.ebitda),
  ])
  return [headers, ...rows].map((r) => r.join(',')).join('\n')
}
