# Work log

Reverse-chronological record of freelance work on this codebase. Client-facing — each entry explains **why** before **what**, links to the commit when available, and notes how the change was verified.

---

## 2026-05-24 — Marketing header now auth-aware

**Gap.** Signed-in users visiting `/` (and any other marketing page — `/pricing`, `/features`, `/blog`, `/about`, `/scanning`, etc.) saw "Sign in" and "Get started" buttons in the top-right header. The buttons made it look like the user had been logged out, even though the session was still valid (clicking "Sign in" would immediately bounce to `/dashboard` because `middleware.ts` already redirects authed users away from auth routes). The experience was confusing for returning users.

**Why this happened.** `apps/web/middleware.ts` redirects authenticated users away from `/login` (and other auth routes) but does **not** touch marketing routes. The `PublicLayout` header is a client component that always rendered the signed-out CTAs without checking auth state.

**Fix.** In [apps/web/components/marketing/vite/PublicLayout.tsx](apps/web/components/marketing/vite/PublicLayout.tsx):

- Added an `isAuthed` state and a `useEffect` that hits `GET /api/me`.
- When authed, both the desktop and mobile headers show a single blue **Dashboard** button linking to `/dashboard`.
- When signed out, the existing "Sign in" + "Get started" CTAs are preserved unchanged — no marketing regression.

**Implementation note.** The first attempt used the browser-side Supabase client (`createBrowserSupabase` → `auth.getUser()`) to detect auth state. It returned `null` user even when a valid session existed — because Supabase auth cookies in this project are HttpOnly and invisible to JavaScript. Switched to `fetch("/api/me")`, which is served by an existing route that uses the server-side Supabase client (`createServerSupabase()`) and reads HttpOnly cookies correctly. Returns 200 when authed, 401 otherwise.

**Files changed.** 1 file — `apps/web/components/marketing/vite/PublicLayout.tsx`.

**Verified.** Local dev server at `localhost:3001`:
- Signed-out path: "Sign in" + "Get started" remain visible — no regression confirmed via screenshot.
- Signed-in path: single "Dashboard" button shows — confirmed by user in their browser after refresh.
- No console errors, clean HMR recompile.

**Commit.** _Pending._

---

## 2026-05-24 — Dev server launch config fix (internal)

**Small infra fix.** `.claude/launch.json` was running `npm run dev -- --port 3001`. The repo's root `package.json` runs `turbo run dev` which doesn't accept a `--port` flag and bailed with `unexpected argument '--port' found`.

**Fix.** Replaced with `pnpm --filter @myaircraft/web dev --port 3001` so the port flag reaches `next dev` directly. This is internal — only affects the AI-assisted dev workflow, not the product.

**Verified.** Dev server starts on port 3001; homepage renders cleanly.

**Commit.** _Pending._

---

## 2026-05-24 — Repo housekeeping: untrack `.claude/settings.local.json`

**Small repo fix.** `.claude/settings.local.json` was listed in `.gitignore` but had been tracked before the ignore rule was added — so it kept showing in `git status` and changes kept getting committed. Ran `git rm --cached` so the gitignore rule actually takes effect from this commit forward. Local file untouched.

**Commit.** _Pending._

---

## 2026-05-24 — WORKLOG + Stop hook automation (internal)

**Setup.** Stood up the freelance work-tracking workflow so the client has a single document to read for transparency.

- `WORKLOG.md` at repo root — this file.
- `.claude/hooks/check-worklog.ps1` — Stop hook that nudges if source changed but `WORKLOG.md` wasn't updated this session.
- `.claude/commands/worklog.md` — `/worklog` slash command for manual updates.
- `.claude/settings.json` — wires the Stop hook into the existing hook config.

**Commit.** _Pending._

---
