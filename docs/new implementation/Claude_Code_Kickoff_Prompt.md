# Claude Code — Kickoff Prompts

_Three prompts. Use the right one per situation. Keep these in your repo at `/docs/prompts/`._

---

## A) FIRST-EVER session prompt (run this once, the very first time)

```
You are now the lead engineer on aircraft.us — an AI-first aviation maintenance platform.

Setup tasks (do these in order, do NOT skip):

1. Read /docs/context.md in full. This is your persistent project memory.
2. Read /docs/Claude_Code_Implementation_Spec.md and verify the spec exists. Do NOT load the whole spec into your working memory — just confirm the file is there and skim the table of contents.
3. Read /docs/Final_Comparison.md to understand the product thesis (you only need to do this once — note in context.md that you've read it so future sessions skip this step).
4. Read these existing files to understand the current codebase shape:
   - /src/app/routes.tsx
   - /src/app/components/AppLayout.tsx
   - /src/app/components/workspace/DataStore.tsx
   - /src/styles/theme.css
   - /package.json
5. Make sure you understand the "Hard rules" in section 4 of context.md.
6. Tell me: which sprint is "Current sprint" in context.md, and are you ready to start it.

Do NOT start coding yet. After step 6, wait for me to say "go."
```

---

## B) PER-SPRINT prompt (use this every time you start a new sprint)

```
Start the next sprint per /docs/context.md.

Procedure (follow exactly, in order):

1. Read /docs/context.md. Find the "Current sprint" in section 5.
2. Open /docs/Claude_Code_Implementation_Spec.md and load ONLY the section for that sprint's feature. Do not load other sections.
3. List the files that section says to create + the existing files it references for integration. Read each existing file before writing new code.
4. Build the feature following the spec exactly:
   - Types go in DataStore.tsx (or a types file if the spec specifies)
   - DataStore CRUD methods follow the existing addX/updateX/deleteX pattern
   - localStorage key follows myaircraft_workspace_data_v1_<orgId>_<entity>
   - Routes added to routes.tsx
   - Sidebar entries added to navItems in AppLayout.tsx if user-facing
   - Reuse existing UI tokens, motion, lucide, sonner
5. Verify the spec's acceptance criterion is met. Run the app if needed; describe how you verified.
6. Update /docs/context.md:
   - Section 5: change "Current sprint" to the next one in the build order (section 6)
   - Section 7: append a row to the session log
   - Section 9: append the file map for this sprint
   - Section 8: add any new blockers
   - Section 11: append any architecture decisions you made
7. Stop. Show me a summary: what you built, files touched, anything that needs my attention. DO NOT start the next sprint without me saying "go."

Hard rules (remember from context.md): add don't replace; follow existing CRUD pattern; one localStorage key per entity; multi-org scoping via useOrg(); persona via usePersona(); reuse UI primitives.

Begin.
```

---

## C) RESUME / RECOVERY prompt (when you come back after a break or things went sideways)

```
We may have lost state. Recover:

1. Read /docs/context.md.
2. Run `git log --oneline -20` and tell me the last 20 commits.
3. Cross-check: is the "Current sprint" in context.md (section 5) consistent with what the last commits suggest? If not, propose an updated "Current sprint" value and wait for me to confirm.
4. Run `git status` and `git diff --stat HEAD` — tell me if there are uncommitted changes.
5. If uncommitted changes exist, summarize what they appear to be and ask whether to commit, discard, or continue them.

Do not write code yet. Wait for my call after this recovery audit.
```

---

## How to use these in practice

1. **First time only:** copy prompt A, paste into Claude Code, hit enter. Wait for it to confirm setup.
2. **Every sprint after that:** copy prompt B, paste, hit enter. Let it work. Review the diff. Commit.
3. **If you come back days later or it crashed mid-sprint:** copy prompt C.

You never paste the spec into the chat. The spec lives in `/docs/`. Claude Code reads only the slice it needs per sprint. **That's the token efficiency.**

## Estimated token cost per sprint

| Activity | Tokens (rough) |
|---|---|
| Read context.md | ~3-4k |
| Read 1 sprint section of spec | ~2-5k |
| Read 3-5 existing files | ~5-15k |
| Generate code for the sprint | ~10-30k output |
| Update context.md | ~1-2k output |
| **Total per sprint** | **~25-60k tokens** |

Vs. pasting the whole 70k-token spec every session: **~3-10× cheaper.**

## What goes in your tomorrow.md

Your `tomorrow.md` is your daily plan. Keep it simple — just paste this template each evening:

```
# Tomorrow

Sprint: <copy from context.md section 5>
Goal: complete sprint and verify acceptance criterion
Time budget: <e.g. 2 hours>
Blockers I need to clear first: <e.g. "create Anthropic API key">

Kickoff command (paste into Claude Code):
[paste prompt B here]
```

That way `tomorrow.md` is your one-glance status and the exact prompt to paste.

## Final advice

- **One sprint per session.** Don't let Claude Code chain sprints unsupervised. Review between each one.
- **Commit between sprints.** Always.
- **Update context.md religiously.** It's the brain. If it drifts from reality, your future sessions get worse.
- **When the AI brings up a blocker** (missing API key, missing Stripe account, etc.), add it to context.md section 8 immediately. Don't try to fix it inside the same session.
- **If a sprint is too big for one session** (Phase 0 multi-org migration, for example), let Claude Code split it into 0a-step1, 0a-step2, etc., and update context.md mid-stream. Don't force-finish a sprint that's running out of context window.
