# FAR/AIM AI Search Integration

Embeds [faraim.us](https://www.faraim.us) AI-powered FAA regulation search inside MyAircraft as a topbar button + modal. Available to owner and mechanic personas under entitlement rules below.

## Files

| File | Purpose |
|------|---------|
| [supabase/migrations/051_faraim_session_usage.sql](../supabase/migrations/051_faraim_session_usage.sql) | Adds `faraim_session_count` + `faraim_last_session_at` to `user_profiles` for free-tier quota tracking. |
| [apps/web/lib/faraim/entitlement.ts](../apps/web/lib/faraim/entitlement.ts) | Pure function `evaluateFaraimAccess()` — decides allow/deny + reason given org plan, trial age, aircraft count, session count. |
| [apps/web/app/api/faraim/session/route.ts](../apps/web/app/api/faraim/session/route.ts) | `POST /api/faraim/session` — gates by entitlement, mints embed token, increments quota for free-tier users. |
| [apps/web/app/api/faraim/entitlement/route.ts](../apps/web/app/api/faraim/entitlement/route.ts) | `GET /api/faraim/entitlement` — cheap check used by `<FaraimButton>` to decide visibility. |
| [apps/web/components/faraim/FaraimButton.tsx](../apps/web/components/faraim/FaraimButton.tsx) | Topbar button. Hidden when not entitled. Shows "X left" badge for free-tier users. |
| [apps/web/components/faraim/FaraimModal.tsx](../apps/web/components/faraim/FaraimModal.tsx) | Full-screen modal with iframe + Ask/Question Bank tabs + free-quota banner. |
| [apps/web/components/faraim/use-faraim-session.ts](../apps/web/components/faraim/use-faraim-session.ts) | Hook that fetches session, schedules auto-refresh 5 min before expiry. |
| [apps/web/components/shared/topbar.tsx](../apps/web/components/shared/topbar.tsx) | Insertion point — `<FaraimButton />` rendered in topbar (shared by owner + mechanic). |

## Entitlement matrix

| Org state | Has aircraft? | Free-tier sessions used | FAR/AIM access |
|-----------|---------------|--------------------------|----------------|
| Paid (`stripe_subscription_id` set, or plan ∈ {pro, fleet, enterprise}) | any | n/a | **Unlimited** |
| Trial active (org < 14 days old, no Stripe sub) | any | n/a | **Unlimited** |
| Free + at least 1 active aircraft | yes | n/a | **Unlimited** |
| Free + no aircraft + < 10 sessions used | no | < 10 | **Allowed**, badge shows remaining |
| Free + no aircraft + ≥ 10 sessions used | no | ≥ 10 | **Blocked** with "Add an aircraft" upgrade CTA |

The 14-day trial window starts at `organizations.created_at`. After expiry, free-tier orgs (no Stripe sub, no aircraft) hit the 10-session quota and then must upgrade.

## Environment variables

Server-side only. Production set via `vercel env add ... production`. Local set in `apps/web/.env.local`.

```
FARAIM_API_BASE=https://www.faraim.us
FARAIM_API_KEY=faraim_live_...
FARAIM_SANDBOX_KEY=faraim_sbx_...
FARAIM_PARTNER_ID=...
FARAIM_ENV=               # optional: 'sandbox' to force sandbox key in prod
```

In dev (`NODE_ENV !== 'production'`), the sandbox key is used. In prod, the live key is used unless `FARAIM_ENV=sandbox`. Keys never reach the browser — only the JWT in the iframe URL does, and that's user-scoped + 8h-TTL.

## Debugging

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Button doesn't appear | `/api/faraim/entitlement` returned `allowed: false` | Check entitlement matrix above. For free-tier without aircraft, quota may be exhausted. |
| Modal shows "FAR/AIM is temporarily unavailable" | `/api/faraim/session` got non-2xx from upstream | Check server logs for `[faraim-session] upstream error` — surface `code` (e.g. `invalid_api_key`, `origin_not_allowed`). |
| `origin_not_allowed` from FARAIM | Domain not on FARAIM's allowlist | Already configured for `myaircraft.us`, `www.myaircraft.us`, `app.myaircraft.us`, `localhost:3000`, `localhost:5173`. Add additional dev ports via FARAIM partner dashboard. |
| Iframe blank / "Refused to frame" | MyAircraft CSP blocking | Add `frame-src https://www.faraim.us https://faraim.us;` to CSP if one is added later. None today. |
| Quota counter not incrementing | `increment_faraim_session_count` RPC missing | Falls back to direct UPDATE via service client — see [route.ts](../apps/web/app/api/faraim/session/route.ts). |

## Sandbox curl

```bash
curl -sS -X POST "https://www.faraim.us/api/partner/v1/embed/session" \
  -H "Authorization: Bearer $FARAIM_SANDBOX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"test-001","sessionTtlSeconds":3600}' | jq .
```

Expected: `success: true`, `data.embedUrls.ask` is a URL starting with `https://www.faraim.us/embed/ask?t=...`.
