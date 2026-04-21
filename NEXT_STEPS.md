# Next Steps — User Action Items

All autonomous work is complete. A few items require YOU to take action:

## 🔴 Critical — Rotate Exposed Credentials

The following credential files are now gitignored but may have been previously exposed:

1. **AWS Access Keys** — `docs/Myaircraft_accessKeys.csv`
   - Rotate in AWS IAM console → delete current access key, create new one
   - Update any env vars that reference the old key (e.g., `AWS_ACCESS_KEY_ID`)

2. **AWS Console Password** — `docs/Myaircraft_credentials.csv`
   - Change the IAM user password in AWS

3. **Google Cloud Service Account** — `docs/documentai-key.json`
   - In GCP Console → IAM & Admin → Service Accounts → delete this key → create a new one
   - Download new key JSON and update wherever it's used (probably Vercel env or Supabase secrets)

## 🟡 Important — Configure Trigger.dev for Document Processing

**Why:** One document in your library is stuck as "failed" because the background job processor isn't configured.

**What to do:**
1. Sign up for [Trigger.dev](https://trigger.dev) if not already
2. Get the `TRIGGER_SECRET_KEY` from their dashboard
3. Add it to Vercel: `vercel env add TRIGGER_SECRET_KEY production`
4. Redeploy: `vercel deploy --prod`

**Alternative:** If you don't want background jobs, the inline pipeline works for most documents (~<50MB). The stuck one was just too large or hit a timeout.

**To retry that stuck doc:** Go to `/admin` → scroll to "Stuck Documents" → click "Retry All Stuck".

## 🟢 Nice-to-Have — Seed Marketing CMS Defaults

The Marketing CMS (`/admin/content`) is live but empty. To populate it with your current homepage/about/features/etc content:

1. Go to https://www.myaircraft.us/admin/content
2. Click **"Seed Defaults"** button (top right)
3. All 9 pages get pre-populated with the current hardcoded content
4. You can then edit any slot to override the defaults

## 🟢 Nice-to-Have — Additional Env Vars to Verify in Vercel

Make sure these are set in Vercel production:
- `OPENAI_API_KEY` — for squawk dictation/photo + AI tools (you should already have this)
- `APP_SECRET` — for encryption (gdrive tokens etc)
- `STRIPE_WEBHOOK_SECRET` — for Stripe webhook signature verification
- `STRIPE_SECRET_KEY` — for Stripe API
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — for client
- `SUPABASE_SERVICE_ROLE_KEY` — for admin operations
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — for Document AI (if used)
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` — for Textract (if used)

## 🟡 Live Reference Docs in Repo

- `ARCHITECT.md` — codebase map (for future AI agents)
- `NEXT_STEPS.md` — this file, your action items
- `AUTONOMOUS_NIGHT_RUN_REPORT.md` — Wave 1-3 summary
- `WAVE_4_5_REPORT.md` — Wave 4-5 post-feedback work with honest test list

## ✅ Summary of What's Live

### Infrastructure
- Sitemap: https://www.myaircraft.us/sitemap.xml (9 pages)
- Robots: https://www.myaircraft.us/robots.txt
- 30 local integration logos in `/public/logos/`

### Admin Tools
- Marketing CMS: https://www.myaircraft.us/admin/content (with Seed Defaults button)
- Stuck Documents card: https://www.myaircraft.us/admin (scroll down)
- Document retry: click any doc → "Retry Processing" in slideover

### Squawks
- Voice (dictation) button + clear error if `OPENAI_API_KEY` missing
- Photo button + clear error if `OPENAI_API_KEY` missing

### Logbook
- All fields unified in `logbook_entries` table (mechanic_name, cert_number, cert_type, logbook_type, parts_used, references, ad_numbers)
- Draft → Entry conversion: `POST /api/logbook-entries/from-draft`
- Signing: `POST /api/logbook-entries/[id]/sign`
- Edit: `PATCH /api/logbook-entries/[id]`
- WO → Logbook: "Create Logbook Entry" button on completed work orders

### Mechanic AI Tools
- Panel in Ask page: "Generate Logbook Entry", "Generate Checklist", "Find Parts"
- API: `/api/ai/generate-logbook`, `/api/ai/generate-checklist`
- Mechanic Portal has "AI Tools" quick link

### Persona Protection
- Server-side role checks on `/admin/*`, `/mechanic/*`, `/workspace/*`
- `/api/me` returns user profile + role + org membership

### SEO
- Per-page metadata on every marketing page
- Blog migrated to MDX in `content/blog/`

### Marketing Content
- Emoji+text spacing fixed on homepage ("AIRCRAFT OWNER" / "A&P MECHANIC")
- Contact form: `POST /api/contact` → stored in `contact_submissions` table

---

## Git Commits

```
1b6dd19 feat: wave 2 - local logos, mechanic AI tools panel, WO→logbook flow
1b774a6 fix: emoji + text spacing on homepage persona labels
a78a64e feat: wave 1 fixes - squawks, logbook, SEO, CMS, personas, mechanic AI
9cc7e10 chore: snapshot of Codex work + security hardening
```

All pushed to `origin/main`. Deployed to `https://www.myaircraft.us` via Vercel.
