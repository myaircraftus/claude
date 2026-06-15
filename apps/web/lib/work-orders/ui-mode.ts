/**
 * Work Orders UI mode — which design renders for the work-orders surface.
 *
 * The redesign ("v2") is the DEFAULT. The original UI ("legacy") stays
 * reachable via `?ui=legacy` so it can be compared side-by-side and switched
 * back to if needed.
 *
 * ── To fully revert to the old UI as the default ──────────────────────────
 * Change DEFAULT_WO_UI below to 'legacy'. That single edit flips the default
 * everywhere (list, detail, create, empty state) and makes the redesign the
 * flagged one (`?ui=v2`). No other change required — every internal link is
 * built from woHref(), which only carries a `ui` param when the mode differs
 * from this default, so URLs stay clean in whichever mode is the default.
 */

export type WoUiMode = 'v2' | 'legacy'

/** The default UI for /work-orders. Flip to 'legacy' to revert. */
export const DEFAULT_WO_UI: WoUiMode = 'v2'

/**
 * Resolve the requested mode from a `ui` query param. Accepts a few friendly
 * aliases; anything unrecognized (including absent) falls back to the default.
 * Accepts the raw Next.js searchParams value (string | string[] | undefined).
 */
export function resolveWoUi(uiParam: string | string[] | null | undefined): WoUiMode {
  const v = Array.isArray(uiParam) ? uiParam[0] : uiParam
  if (v === 'legacy' || v === 'v1' || v === 'old') return 'legacy'
  if (v === 'v2' || v === 'new') return 'v2'
  return DEFAULT_WO_UI
}

/**
 * Build a work-orders URL that keeps the user in their current mode as they
 * navigate. The `ui` param is appended ONLY when `mode` differs from the
 * default — so the default mode always gets clean URLs.
 */
export function woHref(
  path: string,
  mode: WoUiMode,
  extra?: Record<string, string | number>,
): string {
  const params = new URLSearchParams()
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, String(v))
  if (mode !== DEFAULT_WO_UI) params.set('ui', mode)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}
