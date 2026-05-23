-- Seed support_kb_entry with 15 starter published entries so the
-- support first-responder agent has grounding from day one.
--
-- These are intentionally short and platform-specific. They cover the
-- top 15 questions that come into the launcher's Help tab; the
-- kb-curator agent will append more entries over time as patterns
-- emerge in resolved tickets.

INSERT INTO public.support_kb_entry
  (title, body_md, category, persona_scope, keywords, sop_reference, status)
VALUES
  (
    'How to invite a mechanic to your shop',
    $body$Go to **Settings → Team → Invite mechanic**. Enter the mechanic's email and pick a role (Lead Mechanic / IA, Mechanic, or Apprentice). They get an email with a one-click join link; once they accept, they show up in your team list and can be scheduled for work orders.

If the email never arrives, check the **Invites** tab on the same page — pending invites have a copyable join URL you can send them directly.$body$,
    'how-to',
    ARRAY['shop','admin'],
    ARRAY['invite','mechanic','team','add user','onboarding','staff'],
    'SOP-WRK-001 §3',
    'published'
  ),
  (
    'How to add an aircraft',
    $body$From the owner sidebar, open **Aircraft → Add aircraft**. Required fields are tail number, make, and model — year and serial are strongly recommended so the OCR engine can validate logbook dates against the aircraft's build year.

After saving, upload the logbook PDFs from the aircraft's detail page. Processing usually finishes in 2–5 minutes; you'll see entries flow into the timeline as each page is OCR'd.$body$,
    'how-to',
    ARRAY['owner'],
    ARRAY['add','aircraft','tail','register','create aircraft','new plane','n-number'],
    'SOP-OWN-001 §2',
    'published'
  ),
  (
    'Download your data (GDPR export)',
    $body$Open **Settings → Privacy & Data → Download my data**. You'll receive a ZIP within ~5 minutes containing:

- Your profile (JSON)
- Every logbook entry and its source page (PDF + JSON metadata)
- All your work orders, estimates, invoices, and squawks
- Audit log of every read of your records

Exports are signed and timestamped. We log every export to the **audit_event** table — that's by design, you can see your own exports under Settings → Audit log.$body$,
    'how-to',
    ARRAY[]::text[],
    ARRAY['gdpr','export','download','my data','privacy','dsar','data request'],
    'SOP-PRV-001 §4',
    'published'
  ),
  (
    'Reset your password',
    $body$On the **/login** page click **Forgot password?** — enter your email and we'll send a reset link. The link is valid for 1 hour.

If you don't see the email within ~2 minutes, check spam. If still nothing, email **support@myaircraft.us** with the email address you signed up with and we'll trigger a manual reset.

For security we **never** ask for your password. We can't see it; only you can set it.$body$,
    'how-to',
    ARRAY[]::text[],
    ARRAY['password','reset','forgot','locked out','login','cannot sign in'],
    'SOP-SEC-002 §3',
    'published'
  ),
  (
    'Pricing — how billing works',
    $body$myaircraft is per-persona:

- **Owner / Operator**: $19 / aircraft / month, billed monthly. 14-day free trial.
- **Shop (mechanics, admin, full team)**: $149 / mechanic / month, $99 / aircraft serviced / month. 14-day free trial.
- **Bundle (own + shop)**: 20% off both.

You can flip from trial to paid any time on **Settings → Billing**. Trials never auto-convert — if you don't add a payment method, your account moves to a 30-day read-only state, not deletion.$body$,
    'billing',
    ARRAY[]::text[],
    ARRAY['pricing','cost','billing','trial','subscription','plan','price','how much'],
    'SOP-BIL-001 §1',
    'published'
  ),
  (
    'Upload a logbook',
    $body$From the aircraft detail page click **Documents → Upload**. Drop a PDF (engine, airframe, propeller, or W&B). The pipeline:

1. PDF rendered page-by-page (300 DPI)
2. OCR + handwriting recognition per page
3. Logbook entries extracted; you review/approve in **Documents → Review**
4. Approved entries flow into the timeline + power **Ask records**

Multi-aircraft logbooks (one PDF spanning two tail numbers) are split automatically.$body$,
    'how-to',
    ARRAY['owner'],
    ARRAY['upload','logbook','pdf','document','ocr','records','airframe','engine'],
    'SOP-DOC-001 §2',
    'published'
  ),
  (
    'What does "needs review" mean for a document?',
    $body$When a page lands in **Documents → Review**, the OCR engine flagged it as low-confidence on at least one field (date, tach time, mechanic signature, or AD reference). You see a side-by-side: the original page image + the extracted entry. Approve, edit, or skip.

Once you approve, the entry counts as gold-standard truth and flows into the timeline + Ask records.$body$,
    'how-to',
    ARRAY['owner','shop'],
    ARRAY['needs review','review','ocr','low confidence','document review','draft entry'],
    'SOP-DOC-002 §3',
    'published'
  ),
  (
    'Switching between owner and shop persona',
    $body$The persona switcher lives at the top of the sidebar (collapsed dropdown). Click it to flip between Owner and Shop surfaces. Each persona has its own billing entitlement — your shop subscription doesn't unlock the owner view and vice versa.

Platform admins can flip between personas freely (no entitlement check). For everyone else, switching to a persona you don't have a sub for opens the cross-persona upsell.$body$,
    'how-to',
    ARRAY[]::text[],
    ARRAY['persona','switch','owner','shop','toggle','change role','two roles'],
    'SOP-ARC-002 §5',
    'published'
  ),
  (
    'Share an aircraft record with your mechanic',
    $body$From the aircraft detail page click **Share → Invite mechanic**. Pick a mechanic from the shop they're with, or paste their email to send an invite. They get read access to that aircraft's records and can post in the work-order chat.

You can revoke access any time from **Settings → Sharing**. The mechanic doesn't get to see your billing or any other aircraft.$body$,
    'how-to',
    ARRAY['owner'],
    ARRAY['share','aircraft','mechanic','access','invite','customer portal','grant'],
    'SOP-OWN-002 §4',
    'published'
  ),
  (
    'Cancel your subscription',
    $body$Settings → Billing → **Cancel**. You stay in the paid tier until the end of the current period, then we drop you to a 30-day read-only state. You can re-subscribe any time during that window and pick up where you left off.

We **never** silently delete records. After 30 days read-only, you can request a final export via Settings → Privacy → Download my data. Records are deleted only after that export completes and you confirm.$body$,
    'billing',
    ARRAY[]::text[],
    ARRAY['cancel','unsubscribe','stop billing','end subscription','close account'],
    'SOP-BIL-002 §3',
    'published'
  ),
  (
    'My document is stuck in "processing"',
    $body$First check **Documents → Pipeline** — if the page is still in queue you'll see its position. If it's been "processing" for more than 30 minutes, that's a real stuck job:

1. Open the document detail page
2. Click **Retry processing**
3. If that fails twice, flag it from this Help panel — an admin will look at the worker logs

We track every retry; a stuck doc never costs you a credit twice.$body$,
    'bug',
    ARRAY[]::text[],
    ARRAY['stuck','processing','document','pipeline','hung','ocr','worker','retry'],
    'SOP-DOC-003 §4',
    'published'
  ),
  (
    'What the Due List shows',
    $body$The Due List rolls up every inspection and AD that is due, overdue, or due within the user-set look-ahead window (default 60 days) across the fleet. Sortable by aircraft, by due date, or by category (Annual / 100hr / Pitot-static / AD / SB).

A **red** row means overdue. **Amber** = due this week. **Green** = on schedule. Click any row to land on the source entry that established the due date.$body$,
    'how-to',
    ARRAY['shop','owner'],
    ARRAY['due list','annual','100 hour','100hr','ad','inspection','overdue','compliance'],
    'SOP-MNT-001 §2',
    'published'
  ),
  (
    'Export an invoice as PDF',
    $body$From the invoice detail page click **Export → PDF**. The PDF includes line items, parts breakdown, mechanic signature blocks, and the shop letterhead.

If your shop logo isn't on the PDF, set it under **Settings → Shop profile → Logo** — anything you upload there is baked into invoice + work-order PDFs going forward.$body$,
    'how-to',
    ARRAY['shop'],
    ARRAY['invoice','pdf','export','print','download invoice','receipt'],
    'SOP-BIL-003 §2',
    'published'
  ),
  (
    'The AI gave me a wrong answer — what now?',
    $body$Open the message in the Help panel and click the **flag** under the response. We log the question + the wrong answer + the cited KB entries. A human reviews and one of three things happens:

1. The KB entry was wrong → we fix it; everyone benefits.
2. The KB had no entry → we draft one and publish it.
3. The question was out of scope → we tell you where to go instead (e.g. FAA, your insurer, your CPA).

Every flag closes the loop. You'll see your flagged ticket move to **resolved** in your ticket history.$body$,
    'how-to',
    ARRAY[]::text[],
    ARRAY['wrong','incorrect','ai','flag','feedback','bad answer','hallucination','report'],
    'SOP-SUP-001 §5',
    'published'
  ),
  (
    'Remove a mechanic from your shop',
    $body$Settings → Team → click the mechanic → **Remove from shop**. Their auth account is preserved; they just lose access to your shop's records.

The work they signed on remains attributed to them (so audit trails stay intact), but they can no longer open the shop's data, post in customer chats, or be scheduled.$body$,
    'how-to',
    ARRAY['shop','admin'],
    ARRAY['remove','delete','offboard','fire','revoke access','mechanic leaves','terminate'],
    'SOP-WRK-002 §4',
    'published'
  )
ON CONFLICT DO NOTHING;
