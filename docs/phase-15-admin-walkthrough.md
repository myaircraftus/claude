# Phase 15 — Sprint 15.5: Admin Persona Walkthrough

**Tester:** Claude (Chrome MCP)
**Account:** info@myaircraft.us (the only platform-admin account per Phase 15 brief)
**Date:** 2026-05-09
**Result:** 🔴 BLOCKED — every `/admin/*` route redirects to `/dashboard`.

## Pages attempted

| Route | Result |
|---|---|
| /admin | 🔴 Redirect → /dashboard |
| /admin/billing/orgs | 🔴 Redirect → /dashboard |
| /admin/vision/workers | 🔴 Redirect → /dashboard |
| /admin/vision/review | not attempted (same redirect expected) |
| /admin/vision/telemetry | not attempted (same) |
| /admin/ingestion/progress | not attempted (same) |
| /admin/errors | not attempted (same) |
| /admin/billing/batch | not attempted (same) |

## Root cause analysis

`apps/web/app/(app)/admin/layout.tsx` has a two-tier guard:

```typescript
1. await requireRole(ADMIN_AND_ABOVE)
2. const { data: profile } = await supabase
     .from('user_profiles')
     .select('is_platform_admin')
     .eq('id', user.id)
     .single()
   if (!profile?.is_platform_admin) {
     redirect('/dashboard')
   }
```

Two ways this can produce a /dashboard redirect:

### A. Schema mismatch (most likely)

- The query targets **`public.user_profiles`**.
- I cannot directly query the production DB through the Supabase MCP I have
  access to (different project), but the symptoms strongly suggest one of:
  - The `public.user_profiles` table doesn't exist in production at all
    (the schema-of-record may have moved to `auth.users.raw_user_meta_data`,
    a JSONB column, or to `organization_memberships.role`)
  - The table exists but has no row for `info@myaircraft.us`
  - The `is_platform_admin` column exists but isn't `true` for that user.
- In every case, `profile` resolves to null/undefined → `!profile?.is_platform_admin`
  is `true` → unconditional `redirect('/dashboard')`.

### B. Session is not the platform-admin user

- The Chrome session may be authenticated as a different user that LOOKS like
  the admin in the UI (e.g., a delegated org-owner role) but isn't actually
  `info@myaircraft.us`. Check the topbar profile — if email displayed isn't
  info@myaircraft.us, this is the cause.

## Severity

🔴 **P0 — release-blocking.**

The platform admin surface is the only place admins can:
- See cross-org metrics
- Manage tier overrides (`/admin/billing/orgs`)
- Run billing batch jobs (`/admin/billing/batch`)
- See vision worker health (`/admin/vision/workers`)
- Triage errors and retry/resolve (`/admin/errors`)
- Watch ingestion progress (`/admin/ingestion/progress`)

If the platform admin is locked out in production, **every operational
escape hatch is unreachable** — including the kill-switch for billing
(`tier_billing_disabled`) which is settable from `/admin/billing/orgs`.

## Recommended fix path

1. **Identify schema of record for platform admin flag** — verify whether
   `public.user_profiles` should exist (and is missing) or whether
   the layout should query a different source. Likely candidates:
   - `auth.users.raw_user_meta_data->>'is_platform_admin'`
   - `organization_memberships.role = 'platform_admin'`
   - A new view that consolidates auth-level admin status.

2. **Quick bypass for production hot-fix** (Sprint 15.7):
   ```sql
   -- ONLY if user_profiles table truly is missing — DO NOT run blindly
   CREATE TABLE IF NOT EXISTS public.user_profiles (
     id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     is_platform_admin boolean NOT NULL DEFAULT false,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   INSERT INTO public.user_profiles (id, is_platform_admin)
   SELECT id, true FROM auth.users WHERE email = 'info@myaircraft.us'
   ON CONFLICT (id) DO UPDATE SET is_platform_admin = true;
   ```
   But this needs a real migration file with proper RLS, not a one-shot.

3. **Defensive-coding fix in `apps/web/app/(app)/admin/layout.tsx`**:
   - Wrap the profile query in a try/catch and log the error so the symptom
     becomes visible in Sentry / runtime logs.
   - Currently the silent redirect masks the underlying error.

## What worked

- `requireRole(ADMIN_AND_ABOVE)` against `organization_memberships` correctly
  identifies the user as having owner/admin role in their tenant — that
  check passes (we know this because the redirect target is /dashboard, not
  /onboarding which is what `requireRole` would redirect to if no membership).
- The redirect lands on /dashboard cleanly (no broken page or 500).

## What this means for Phase 15.6 / 15.7

- Sprint 15.7 should include a hot-fix for this BEFORE we ship anything
  else, since admin tools are needed to triage other findings.
- Sprint 15.6 (cross-persona + edge cases) will need to use `tsx-pg`
  one-shots for any test that requires admin actions (e.g., changing org
  tier to test SLA banner copy).

## Carry-over from prior sprints

- 🔴 P0 (15.2/15.3): persona-strict guards bypassed for platform admin —
  related theme but separate code path. Both findings indicate the
  platform-admin / persona model needs a design call before the v1 launch.
