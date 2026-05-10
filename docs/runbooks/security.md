# Security Runbook

Operational procedures for security-relevant production changes that
aren't auto-applied by deploys. Each procedure ships as a migration
file so the change is auditable + reproducible.

## Platform admin grant procedure

Platform admin status (`user_profiles.is_platform_admin = true`) gates
every `/admin/*` page including billing kill-switches, vision worker
health, error triage, and ingestion progress. Production protects this
flag with a server-side trigger; flipping it requires a deliberate
migration.

### Current admins (as of 2026-05-09, after migration 114)

| Email | Granted | Migration |
|---|---|---|
| `info@myaircraft.us` | seed | (pre-existing trigger applied directly to prod, captured in 114) |
| `andy@horf.us` | 2026-05-09 | `114_platform_admin_whitelist.sql` |

The whitelist lives in the body of
`public.enforce_platform_admin_email()` (a SECURITY DEFINER plpgsql
function) which a BEFORE INSERT/UPDATE trigger
(`trg_enforce_platform_admin_email`) calls on every change to
`public.user_profiles`. The function `RAISE`s
`ERRCODE='check_violation'` if any non-whitelisted email is set to
`is_platform_admin = true`.

### Grant a new admin (write a new migration)

Adding a future admin is **not** a `psql` one-liner. Write a migration
following the 114 pattern so the audit trail is the migration file:

1. Decide the next migration number (e.g. `115_add_admin_<initials>.sql`).
2. Copy the body of `114_platform_admin_whitelist.sql`. Replace the
   IN clause with the expanded whitelist, keeping ALL existing emails:

   ```sql
   CREATE OR REPLACE FUNCTION public.enforce_platform_admin_email()
   RETURNS trigger
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public'
   AS $$
   BEGIN
     IF NEW.is_platform_admin = TRUE
        AND LOWER(NEW.email) NOT IN (
              'info@myaircraft.us',
              'andy@horf.us',
              'new-admin@example.com'        -- ADD HERE
            ) THEN
       RAISE EXCEPTION
         'is_platform_admin can only be true for whitelisted accounts (got: %)',
         NEW.email
         USING ERRCODE = 'check_violation';
     END IF;
     RETURN NEW;
   END;
   $$;
   ```

3. Drop + recreate the trigger idempotently (so a fresh staging clone
   that has only the function but no trigger ends up correct):

   ```sql
   DROP TRIGGER IF EXISTS trg_enforce_platform_admin_email ON public.user_profiles;
   CREATE TRIGGER trg_enforce_platform_admin_email
     BEFORE INSERT OR UPDATE ON public.user_profiles
     FOR EACH ROW EXECUTE FUNCTION public.enforce_platform_admin_email();
   ```

4. Promote the new admin (idempotent):

   ```sql
   UPDATE public.user_profiles
      SET is_platform_admin = true,
          updated_at = NOW()
    WHERE email = 'new-admin@example.com'
      AND is_platform_admin = false;
   ```

5. Audit row in `tier_history`. Use a unique `reason` string + a
   `NOT EXISTS` guard so re-running doesn't duplicate:

   ```sql
   INSERT INTO public.tier_history
     (organization_id, from_tier, to_tier, changed_by_user_id, reason, changed_at)
   SELECT om.organization_id, 'beta', 'beta', up.id,
     'Platform admin status granted to new-admin@example.com via migration 115_<short>',
     NOW()
   FROM public.user_profiles up
   JOIN public.organization_memberships om
     ON om.user_id = up.id AND om.accepted_at IS NOT NULL
   WHERE up.email = 'new-admin@example.com'
     AND NOT EXISTS (
       SELECT 1 FROM public.tier_history th
       WHERE th.reason = 'Platform admin status granted to new-admin@example.com via migration 115_<short>'
     )
   LIMIT 1;
   ```

6. Author `apps/web/scripts/apply-115.ts` mirroring `apply-114.ts`:
   it should `BEGIN` / `COMMIT`, then verify (a) the function body
   contains every whitelist email, (b) the trigger has 2 rows
   (INSERT + UPDATE), (c) the new admin shows in
   `WHERE is_platform_admin = true`, (d) the audit row exists.

7. Andy reviews the migration + apply script in the PR before they
   run the apply locally.

8. After applying, the new admin must **log out + back in** in their
   browser so the cached JWT picks up the elevated profile.

### Revoke an admin

Same pattern, opposite direction. Author a new migration that:

1. Sets `is_platform_admin = false` for the target email.
2. CREATE OR REPLACEs `enforce_platform_admin_email()` with the
   shrunk whitelist.
3. Writes an audit row to `tier_history` with reason
   `Platform admin status revoked from <email> via migration NNN_<short>`.

Do **not** simply `DROP` the user — the trigger blocks the un-set
update from any non-admin operator, but a service-role connection can
flip it. Keep the audit row regardless.

Removed admins should be encouraged to log out so their cached JWT
expires.

## Sacred boundaries

These directories are read-only for any automated process and require
explicit human review before any change ships:

- `apps/web/lib/ocr/` — OCR pipeline
- `apps/web/lib/rag/` — retrieval-augmented generation
- `apps/web/lib/embeddings/` — embedding service

Verifying zero diff at the end of every sprint:

```bash
git diff origin/main...HEAD -- apps/web/lib/ocr apps/web/lib/rag apps/web/lib/embeddings
```

Should produce no output. If a sprint genuinely needs to touch any of
these, it must be a separate, isolated commit with explicit Andy review.

## Production CHECK / trigger inventory

Database-level guards that look like CHECK constraints from PostgREST
but are actually triggers (and the local migrations they live in):

| Guard | Type | File | Purpose |
|---|---|---|---|
| `trg_enforce_platform_admin_email` | trigger + function | `supabase/migrations/114_platform_admin_whitelist.sql` | Whitelists which emails can be `is_platform_admin = true` |

If a future error message includes `ERRCODE='check_violation'` but no
matching CHECK constraint can be found, look here for triggered
exceptions raised manually.

## Related

- Phase 15 QA report: [`docs/phase-15-qa-report.md`](../phase-15-qa-report.md)
  (F1 resolution detail + F2 design call still pending)
- Migration 114 source: [`supabase/migrations/114_platform_admin_whitelist.sql`](../../supabase/migrations/114_platform_admin_whitelist.sql)
- Apply script: [`apps/web/scripts/apply-114.ts`](../../apps/web/scripts/apply-114.ts)
