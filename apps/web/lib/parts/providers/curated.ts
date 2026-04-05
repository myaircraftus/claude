// Curated aviation vendor provider — stub for future direct integrations
// (Aircraft Spruce, Sporty's, etc.). Today this returns no results but keeps
// the provider interface in place so we can add adapters later.

import type { ProviderContext, ProviderResult } from '../types'

export async function runCuratedProvider(_ctx: ProviderContext): Promise<ProviderResult> {
  return { provider: 'curated', ok: true, offers: [], durationMs: 0 }
}
