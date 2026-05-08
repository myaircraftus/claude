# Overnight Run — FINAL REPORT (HALTED)

**Status:** 🛑 STOP — completed 0 of 8 phases. No code changes. No commits beyond this report.
**Date:** 2026-05-08, evening into night.
**Halt trigger:** Repeated, unresolved ambiguity in the brief — escalated to "final report" per your rule 7 ("Anything ambiguous → log for Andy, do not guess").

---

## TL;DR

> The 8-phase brief was sent in two messages. The first was truncated mid-sentence; the second restated the execution rules but did not fill the gap. I stopped at the gate, audited the codebase to scope the divergence, and wrote this report. **You wake up to no broken code and a clean unblocker list.** Phases 1–7 ready to retry once the brief is whole.

---

## What you sent

**Message 1** (initial brief):
- Hard stops, work boundaries, commit cadence
- Phase 1 outline (Persona Hygiene Audit) — but truncated at: *"If missing, add it. The component pattern:"*
- No content for Phases 2, 3, 4, 5, 6, 7
- Phase 8 mentioned by name (Vision RAG) — explicitly skipped

**Message 2** (after my halt-at-gate report):
- Restated 10 execution rules
- Said "Begin with Phase 1"
- Did not resend the truncated portion
- Did not provide Phases 2–7

So I have at most **a partial Phase 1**, no Phase 2–7, and a "do not start Phase 8" gate. I cannot run for 6–10 hours on 1 of 8 phases that's itself half-specified.

## What's still ambiguous after Message 2

| Item | Status |
|---|---|
| Phase 1 step 2 code pattern (`<RequirePersona>` wrapper definition) | ❌ Truncated, never resent |
| Phase 2–7 | ❌ Never sent |
| `/docs/context.md` to read first | ❌ File does not exist at that path |
| `/src/app/routes.tsx` to audit | ❌ File does not exist anywhere in repo |
| `/src/app/components/AppLayout.tsx` | ⚠ Closest match: `apps/web/components/redesign/AppLayout.tsx`, in a parallel tree |
| Branch policy ("Stay on `main`") | ⚠ Main has different content than the worktree branch I was last working in |
| Persona enum source-of-truth | ❌ Not pointed at |
| Where `usePersona()` lives | ⚠ Used in some files; canonical export not confirmed |

## Architectural finding (worth a coffee in the morning)

**The brief is written against a different architecture than what is actually deployed.**

`/docs/new implementation/context.md` (the only context.md in the repo, found at a slightly different path than the brief specified) describes the project as:

> - React 18 + TypeScript + Tailwind v4 + Motion + Lucide + Sonner
> - **Routing: React Router (Data Mode) in `/src/app/routes.tsx`**
> - App shell: `/src/app/components/AppLayout.tsx`
> - Global state: `/src/app/components/workspace/DataStore.tsx` (React Context + localStorage)

But what's actually in the repo and deployed at `myaircraft.us` is:

> - React 18 + TypeScript + Tailwind + Next.js 14 App Router (filesystem routing)
> - App shell: split between `apps/web/app/(app)/layout.tsx` + `apps/web/components/shared/sidebar.tsx` + `apps/web/components/shared/topbar.tsx`
> - Global state: Supabase server queries + React server components, no localStorage-backed DataStore
> - The "redesign" tree at `apps/web/components/redesign/` (with the AppLayout.tsx + DataStore.tsx the brief assumes) is a Figma-imported parallel implementation that has **not** been wired into the live nav

I confirmed this by walking both trees:

```
# Brief targets these (redesign tree — Figma migration):
apps/web/components/redesign/AppLayout.tsx                 (748 lines, has navItems + personas)
apps/web/components/redesign/workspace/DataStore.tsx       (exists, React Context + localStorage)
apps/web/components/redesign/AircraftDetail.tsx
apps/web/components/redesign/Dashboard.tsx
apps/web/components/redesign/MechanicPortal.tsx
…40+ other Pages

# What the live app actually serves:
apps/web/components/shared/sidebar.tsx                     (zero personas, zero navItems, server-rendered)
apps/web/components/shared/topbar.tsx                      (Clock In + Feedback + Support + bell + avatar)
apps/web/app/(app)/<route>/page.tsx                        (filesystem routing — no central routes.tsx)
```

**Implication:** if I do Phase 1 against the redesign tree, I'll be auditing a parallel implementation that nobody hits in production. If I do Phase 1 against the live app, the brief's path references all miss and I'd have to invent the persona-gating pattern from scratch. Either way I'd be guessing.

This is not a "minor ambiguity" — it's the central uncertainty of the whole overnight run. That's why I stopped and wrote it up rather than picking a side.

## What I did NOT do

- ❌ Did not edit, create, or delete any application code
- ❌ Did not commit or push anything beyond this report
- ❌ Did not run migrations
- ❌ Did not modify env vars
- ❌ Did not touch `/lib/ocr`, `/lib/rag`, `/lib/embeddings`, `/lib/ingestion`, or `/lib/documents/*`
- ❌ Did not modify `/docs/smoke-test-results.md` (per WORK BOUNDARIES from the brief)
- ❌ Did not switch branches to "main" (already there in the main repo at `/Users/andy/1. do not touch/myaircraft/`; was operating in worktree `claude/gallant-mendeleev-8d5357` for the smoke test session)

## What I DID do

- ✅ Re-read the truncated brief carefully
- ✅ Located the actual `context.md` (it's at `docs/new implementation/context.md`, not `docs/context.md` as the brief said)
- ✅ Audited the redesign vs live tree split via grep — confirmed the brief's targets are in the redesign tree only
- ✅ Confirmed `/src/app/routes.tsx` does not exist anywhere
- ✅ Verified main branch state: clean except `apps/web/tsconfig.tsbuildinfo` (build artifact, untracked) and `docs/smoke-test-results.md` (untracked from earlier session, not modified overnight)
- ✅ Wrote this final report

I considered producing a "safe Phase 1 deliverable" — `/docs/persona-contracts.md` documentation only, no code — but that doc would presuppose I know which tree to write it for. So even that's a guess. Skipped.

---

## How to unblock the next overnight run

When you're awake and have coffee, send me a single message containing:

### A. The full Phase 1 (resend the truncated portion)

The brief stopped at: *"If missing, add it. The component pattern:"*. I need the rest — the actual code template you want me to use for adding persona gates. Most likely candidates:

```tsx
// Option A: server component check
export default async function Page() {
  const persona = await getPersona();
  if (!['owner', 'admin'].includes(persona)) redirect('/home');
  // …
}

// Option B: client wrapper
'use client';
function GuardedPage() {
  const persona = usePersona();
  if (!['owner', 'admin'].includes(persona)) {
    useRouter().replace('/home');
    return null;
  }
  return <RealPage />;
}

// Option C: a real <RequirePersona> component
<RequirePersona personas={['owner', 'admin']}>
  <Page />
</RequirePersona>
```

Whichever you pick, point me at where it should live and what the exact API looks like.

### B. Phases 2 through 7

Self-explanatory — they aren't in any message I've received.

### C. Pick the target tree

Three options, please pick one:

1. **Live deployed app only** (`apps/web/app/(app)/*` + `apps/web/components/shared/*`). Real users hit this. The brief's path references will all need to be re-interpreted. No central `routes.tsx`; persona gating goes inside each `page.tsx` server component.
2. **Redesign tree only** (`apps/web/components/redesign/*`). The Figma migration. Has the navItems + personas + DataStore.tsx structure the brief assumes. Not yet wired into the live nav. Auditing this is essentially polishing the migration target.
3. **Both**. Sequential phases — do the redesign tree first as a self-contained chunk, then port persona gates to the live app afterwards.

### D. Confirm branch + push intent

The previous smoke test ran from worktree branch `claude/gallant-mendeleev-8d5357`, and that branch's HEAD is what's live at production. Main is several commits behind that branch in the integrations / billing / faraim space. So "Stay on main" + "your work should match what's deployed" are in tension. Tell me which one wins.

### E. Persona model

Confirm:
- The persona enum (string literal type? const? Zod enum?) and where it's defined.
- Whether "shop" is a persona, a plan SKU (per `lib/billing/products.ts`), or both.
- Whether "admin" is a fifth persona or the org-role-axis (separate from owner/mechanic/shop personas).
- Whether the persona gates should also check role (e.g. an `owner` who isn't an org-admin shouldn't see `/org/*`).

The brief enumerated four (owner, mechanic, shop, admin) but the code has both a persona axis and a role axis, and they don't always line up.

### F. Phase 1's nav-item map — sanity check a few entries

Quick gut-check items the brief listed that don't quite match the live app:

- `telemetry` → no `/telemetry` route exists. Closest: per-aircraft telemetry inside `/aircraft/[id]`. Should the rule apply at the aircraft-detail level instead?
- `billing-rates` → no separate `/billing-rates` route. Labor rates live under `/org/settings`, which the same rule says is admin-only. Conflict.
- `accounting` → no `/accounting` route. QBO is at `/org/integrations/qbo` (admin only, again).
- `clock-in` → the route is `/clock`, not `/clock-in`. Cosmetic.

These suggest the brief's nav map is from an older spec or the redesign-tree-as-planned. Either is fine, just need confirmation.

---

## Recommended overnight format for next attempt

Honest feedback on what would have made this work:

1. **One phase at a time, not 8.** Sleep on Phase 1's report, then queue Phase 2 the next night.
2. **Commit but don't push.** Vercel auto-deploys main; if I'm wrong, that hurts. Have me leave commits unpushed for you to review and push in the morning.
3. **Fresh branch per overnight.** `overnight-2026-05-08` rather than main. Easier to revert wholesale if something's wrong.
4. **Pre-flight check.** First instruction is a list of files I have to confirm exist before doing any work. If any is missing, I halt at the gate (formalizes the halt-pattern instead of leaving it to my judgment).
5. **Smaller atomic deliverables.** "Write the persona contracts doc" is one job. "Add persona gates to the redesign tree" is a different job. "Add persona gates to the live app" is a third. Split them and the failure modes get tractable.

Happy to retry any of those formats once the brief is unblocked.

---

## Files I touched

```
docs/overnight-report.md   (this file — created/replaced)
```

That's it.

---

## Short version

> Brief still truncated. Codebase has parallel architectures (Next.js live + React-Router-style redesign tree); brief targets the redesign tree but the live app is what runs in prod. Stopped before guessing. Asks above. — Claude
