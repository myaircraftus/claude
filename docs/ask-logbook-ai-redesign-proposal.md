# Ask Logbook AI — UX Redesign Proposal

> **Status:** PROPOSAL — awaiting review. No code changes yet.
> **Date:** 2026-06-04
> **Surface:** `/ask` and its owner-facing alias `/ask-logbook-ai`
> **Primary component:** `apps/web/components/ask/ask-experience.tsx` (~880 lines)
> **Author note:** This is grounded in a full read of the source, not a live render — exact pixel spacing/contrast is inferred from the Tailwind classes. Every claim cites `file:line` so it can be verified.

---

## 1. TL;DR

The Ask page has good bones (token streaming, deep-linked citations, confidence/warnings/follow-ups, a mobile citation modal) but suffers from **three broken wires**, **visible redundancy**, and a **layout that fights the user**. The redesign keeps the architecture and fixes the experience:

1. **Wire up voice.** The floating mic currently records, transcribes, and *throws the transcript away*. Move it into the composer and feed it to the question box.
2. **Stop hijacking the layout.** Every answer auto-opens the first source and collapses the conversation sidebar. Make source preview a user-initiated, non-destructive drawer.
3. **Never destroy user work.** Switching persona silently wipes the conversation. Keep a thread per persona.
4. **Cut the noise.** Confidence is shown twice per answer; the legal disclaimer repeats under every answer. Show each once.
5. **Pick one blue.** The page mixes navy `primary` with bright-blue `brand-500` for the *same* citation. Unify on `primary`.
6. **Calmer type, actionable empty states, a real composer** (auto-grow textarea + Stop button).

Effort is phased so Phase 0–1 (color unify + broken wires) ships in ~1–2 days at low risk, before any layout work.

---

## 2. Scope & context

### Routes & ownership
- `/ask-logbook-ai` (owner nav label "Ask Logbook AI", `AppLayout.tsx:87`) **re-exports** `/ask` (`app/(app)/ask-logbook-ai/page.tsx:9`). One implementation, two routes.
- The page is `AskExperience` + a floating `<VoiceButton/>` (`app/(app)/ask/page.tsx:8-14`).
- It runs inside the app shell: a 240px navy sidebar, a persona-aware billing banner, and a bottom-right corner that **already** holds `UnifiedLauncher` and `WorkOrderChatBubble` (`AppLayout.tsx:1152-1168`).

### Personas
- Two modes inside the page: **Owner** and **Mechanic** (internally `owner` / `shop`), toggled top-right (`ask-experience.tsx:982-1004`). Mechanic mode adds the Quick Tools panel and maintenance-flavored prompts.
- The global sidebar persona switcher is intentionally **hidden on `/ask`** (`AppLayout.tsx:296`) — the in-page toggle is the substitute. Keep that decision.

### What success looks like
| Goal | Measurable proxy |
|------|------------------|
| Lower friction to first answer | Fewer clicks/taps from load → answer; voice actually works |
| Don't lose user work | Zero accidental conversation wipes |
| Trust the answer | Citation + confidence legible, source one tap away, not forced |
| Looks intentional | One accent color, one type scale, no duplicate UI |

### Constraints (the redesign must honor these)
- Reuse existing design tokens (`globals.css`, `tailwind.config.ts`). No new design system.
- Keep both personas and the RAG/citation contract from `/api/ask`.
- Citations are the product's **trust mechanism** — they can be refined but never buried.
- Solo dev, pre-launch: prefer incremental, low-risk phases over a big-bang rewrite.

---

## 3. Current-state audit

### Desktop layout today

```
main content (right of the 240px navy app sidebar)
┌───────────────────────────────────────────────────────────────────────────┐
│ [Billing banner]                                                           │
│ ┌──────────────────────────────────────────────┬──────────────────────┐   │
│ │ ✦ Ask Your Aircraft        [Owner|Mechanic] [▾ All aircraft]         │   │ ← header, p-6
│ │ Owner mode                                     │                      │   │
│ ├──────────────────────────────────────────────┤  RIGHT SIDEBAR       │   │
│ │                                                │  320px               │   │
│ │            (empty state OR transcript)         │  ┌────────────────┐  │   │
│ │                  max-w-2xl, centered           │  │ Mechanic tools │  │   │ ← shop only
│ │                                                │  └────────────────┘  │   │
│ │                                                │  Conversations       │   │
│ │                                                │   • thread …         │   │
│ │                                                │   • thread …         │   │
│ ├──────────────────────────────────────────────┤                      │   │
│ │ [ input ............................. ] [ ▶ ] │                      │   │
│ └──────────────────────────────────────────────┴──────────────────────┘   │
│                                    ✦(floating Voice)  ●(UnifiedLauncher)    │ ← crowded corner
└───────────────────────────────────────────────────────────────────────────┘

When a citation opens, the right sidebar animates 320px → 40% and REPLACES
the Conversations list with the PDF "Source Preview" (ask-experience.tsx:1211).
This happens automatically on every answer.
```

### Friction inventory

| # | Issue | Sev | Evidence | Why it hurts |
|---|-------|-----|----------|--------------|
| 1 | **Voice discards the transcript** | 🔴 | `ask/page.tsx:12` renders `<VoiceButton/>` with no `onResult`; `VoiceButton.tsx:133` calls `onResult?.(…)` | The one thing voice should do on an Ask page (dictate a question) doesn't happen — it just toasts and drops it |
| 2 | **Floating mic collides with global launchers** | 🟠 | `fixed bottom-4 right-4 z-40` over `UnifiedLauncher` + `WorkOrderChatBubble` (`AppLayout.tsx:1152-1168`) | Three stacked floating buttons; the mic also floats over the right sidebar content |
| 3 | **Persona switch silently wipes the chat** | 🔴 | `ask-experience.tsx:593-600` resets `messages`/`question`/`threadId` on persona change | Curious tap on "Mechanic" destroys an in-progress conversation, no warning |
| 4 | **Every answer auto-hijacks the sidebar** | 🟠 | `maybeOpenCitation` (`:674`, `:724`, `:776`) + width swap (`:1211`) | Collapses the conversation list and shoves the chat on each answer the user didn't ask to see a source |
| 5 | **Confidence shown twice** | 🟡 | `ConfidenceBadge` (`answer-block.tsx:128`) + pill in Sources row (`ask-experience.tsx:1158`) | Redundant, adds visual weight |
| 6 | **Disclaimer repeats under every answer** | 🟡 | `answer-block.tsx:200-204` | A 10-turn thread shows it 10× |
| 7 | **Two blues for the same thing** | 🟡 | inline `[N]` = `brand-500` (`answer-block.tsx:78`); Sources pill = `primary` (`ask-experience.tsx:1117`) | Same citation appears bright-blue inline, navy below — looks unintentional |
| 8 | **No-documents empty state is a dead end** | 🟠 | `ask-experience.tsx:1032-1047` | "You can only view this aircraft manually" — confusing copy, zero CTA |
| 9 | **Suggested prompts vanish after msg 1** | 🟡 | gated on `messages.length === 0` (`:1030`) | Capability discovery disappears permanently |
| 10 | **Single-line input, no Stop** | 🟡 | `<Input>` maxLength 2000 (`:1187`); send is disabled-spinner (`:1197`) | Long squawk descriptions are cramped; can't abort a long fleet answer |
| 11 | **Scope isn't reinforced** | 🟡 | scope only in header dropdown | After asking, nothing says "across all aircraft" vs "N12345 only" |
| 12 | **Micro-typography & invisible feedback** | 🟡 | `text-[10px]`/`text-[11px]`, inline `style={{fontWeight}}`, hover `bg-primary/3` | Hard to read for the audience; near-invisible hover states |
| 13 | **Mechanic "Use This" loses the result** | 🟡 | `mechanic-tools-panel.tsx:73-81` navigates to `/maintenance/new`, dropping the generated text | Generate-then-lose is a let-down |
| 14 | **Duplicate scope context** | 🟡 | sidebar owner aircraft selector (`AppLayout.tsx:735-749`) + in-page dropdown | Two aircraft pickers, possibly out of sync |

### What's already good — do NOT break
- Token streaming with staged status labels (`STREAM_STATUS_LABELS`, `:117`).
- Citation deep-links with ⌘-click → new tab, plain-click → side preview (`:1137-1156`).
- Mobile full-screen citation modal (`:929-967`).
- Per-aircraft dedupe + persisted selection (`dedupeAircraftOptions`).
- Confidence + warning flags + follow-up questions scaffolding (`answer-block.tsx`).
- Fanned-out "All Aircraft" per-aircraft sections (`PerAircraftAnswer`).

---

## 4. Design principles (north star)

1. **Answer-first, evidence one tap away.** The answer is the product; the source is the proof. Proof is always reachable, never forced into view.
2. **One scope, always visible.** The user should never wonder whether they're asking one aircraft or the whole fleet.
3. **Never destroy user work.** No state-clearing without intent. Switching persona, aircraft, or thread preserves what the user can return to.
4. **One accent, calm type.** A single interactive color (`primary` navy) and one type scale. Semantic colors (confidence, warnings) stay.
5. **Progressive disclosure.** Show the essentials; reveal sources, raw artifacts, and disclaimers on demand or once.
6. **Respect the corner.** The bottom-right belongs to the global launchers. The page doesn't add floating chrome there.

---

## 5. Reworked layout

### Column model
Keep the two-pane split, but change the right pane's behavior:

- **Left/main pane:** header → transcript → composer (unchanged structure).
- **Right pane (default, 320px):** the **Context panel** — Conversations history, plus Mechanic Quick Tools in shop mode. This stays put.
- **Source preview:** becomes an **overlay drawer** that slides in *over* the right pane (or as a wider right-anchored sheet on large screens), **without collapsing the chat**. Closing it returns to the Context panel exactly as it was. It opens only on explicit citation click — never automatically.

### Desktop — conversation state (proposed)

```
┌──────────────────────────────────────────────┬──────────────────────┐
│ ✦ Ask Logbook AI    [Owner | Mechanic]        │  CONTEXT PANEL 320   │
│ Scope: [▾ All aircraft]   ·  source-backed     │  ┌────────────────┐  │
├──────────────────────────────────────────────┤  │ + New chat     │  │
│                                                │  ├────────────────┤  │
│  ┌───────────────────────────────┐  user →     │  │ 🔎 search …    │  │
│  └───────────────────────────────┘             │  │ Today          │  │
│  ┌────────────────────────────────────────┐    │  │  • thread …    │  │
│  │ ● High confidence   · N12345            │    │  │  • thread …    │  │
│  │ Answer text with inline ⟨1⟩ citation…   │    │  │ Earlier        │  │
│  │ Sources: ⟨1⟩ Logbook  ⟨2⟩ POH    [Copy] │    │  │  • thread …    │  │
│  │ Suggested: ‹follow-up› ‹follow-up›       │    │  │                │  │
│  └────────────────────────────────────────┘    │  │ (Mechanic mode:│  │
│                                                │  │  Quick Tools)  │  │
├──────────────────────────────────────────────┤  └────────────────┘  │
│ ┌──────────────────────────────────────────┐  │                      │
│ │ 🎙  Ask about records, inspections…   ▶ │  │                      │
│ └──────────────────────────────────────────┘  │                      │
│ AI-generated · verify with your A&P (once)     │                      │
└──────────────────────────────────────────────┴──────────────────────┘
```

### Desktop — source open (drawer, non-destructive)

```
┌──────────────────────────────────────────┬───────────────────────────┐
│ … transcript stays exactly where it is …  │  ▌ SOURCE PREVIEW    [↗][✕]│ ← slides over
│                                            │  ▌ Logbook p.42           │   the context
│                                            │  ▌ ┌─────────────────────┐│   panel; chat
│                                            │  ▌ │  PDF page, passage  ││   does NOT
│                                            │  ▌ │  highlighted        ││   reflow
│                                            │  ▌ └─────────────────────┘│
├──────────────────────────────────────────┤  ▌ Open full page ↗       │
│ [ composer ]                               │                           │
└──────────────────────────────────────────┴───────────────────────────┘
```

Rationale: the current 320px→40% width animation (`:1211`) reflows the entire transcript on every answer. An overlay drawer removes the reflow, preserves the conversation list, and still gives the PDF more room. The mobile path already uses an overlay (`:929`) — this makes desktop consistent with it.

### Empty states (both actionable)

**First run / no messages:** keep the centered hero, but the suggested prompts become a **persistent, scrollable chip row** that also lives above the composer after the first message (see §8).

**Selected aircraft has no documents** (`:1032`) — replace the dead end with:
```
   📄  No documents for N12345 yet
   The AI reads your uploaded records — there's nothing to read for this tail.
   [ Upload documents ]   [ Ask across all aircraft ]
```

### Mobile
- Single column: header (scope as a compact chip) → transcript → composer.
- Source preview stays the existing full-screen modal (`:929`).
- Context panel (Conversations) becomes a slide-in sheet from a header button.

---

## 6. Component hierarchy

`AskExperience` today is one ~880-line client component doing data loading, streaming, persona, scope, rendering, and history. Split it for clarity and testability. **None of this changes the `/api/ask` contract.**

```
AskExperience (container: orchestrates state + data)
├─ useAskScope()         ← aircraft list, selected scope, doc counts, URL sync
├─ useAskThreads()       ← list/open/delete, thread-per-persona map
├─ useAskStream()        ← the NDJSON reader (extracted from :680-806)
│
├─ <AskHeader>
│   ├─ <PersonaToggle>           (owner|mechanic; guarded switch — §8)
│   └─ <ScopeSelector>           (aircraft dropdown; emits ScopeChip data)
│
├─ <AskTranscript>
│   ├─ <UserBubble>
│   ├─ <AssistantAnswer>
│   │   ├─ <ScopeChip>           (reused: restates scope per answer)
│   │   ├─ <AnswerBlock>         (refactor: single confidence, no per-answer disclaimer)
│   │   ├─ <ArtifactCard>        (keep)
│   │   ├─ <SourcesRow>          (citation pills; unified color)
│   │   └─ <AnswerActions>       (Copy, timestamp)
│   ├─ <StreamingIndicator>      (status label; + Stop affordance)
│   └─ <AskEmptyState>           (first-run | no-documents variants, both with CTAs)
│
├─ <AskComposer>                 (auto-grow textarea + <MicButton> + Send/Stop)
│
└─ <ContextPanel>  (right pane, 320px — persistent)
    ├─ <MechanicToolsPanel>      (keep; fix "Use This" wiring later)
    └─ <ConversationsList>       (search, date-grouped, rename)

<SourcePreviewDrawer>            (overlay; opens on citation click only)
```

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `useAskStream` | **new** (extract) | Own the NDJSON reader + abort controller (enables Stop) |
| `useAskScope` / `useAskThreads` | **new** (extract) | Isolate data + URL/localStorage sync; thread-per-persona |
| `AskComposer` | **new** | Textarea, mic, send/stop, counter — the friction hot spot |
| `MicButton` | **refactor** | `VoiceButton` minus the floating wrapper; `onResult → setQuestion` |
| `SourcePreviewDrawer` | **refactor** | Overlay instead of sidebar-collapse; reuse `DocumentViewer` |
| `ScopeChip` | **new** | One element, shown in header and on each answer |
| `AskEmptyState` | **new** | First-run + no-docs, both with actions |
| `ConversationsList` | **refactor** | Search, date grouping, rename |
| `AnswerBlock` | **refactor** | Remove duplicate confidence; disclaimer once |
| `AnswerActions` | **new** | Copy answer, show timestamp (already stored, never shown) |
| `ContextPanel` | **new** (wrapper) | Keeps history + tools persistent |

Key state changes:
- **Thread-per-persona:** replace the persona-reset effect (`:593`) with a `Record<persona, {threadId, messages}>` so switching preserves both sides.
- **Abortable stream:** `useAskStream` holds an `AbortController`; Stop calls `.abort()`.
- **Scope as derived data:** `ScopeChip` reads from `useAskScope`, rendered in header + answers.

---

## 7. Visual spec

### Color — unify on `primary`
The design system primary is **navy `#0C2D6B`** (`--primary-rgb: 12 45 107`). The Ask page leaks **`brand-500` `#3b82f6`** into citations and follow-ups. Decision: **interactive/brand elements use `primary`.** Keep semantic colors.

| Element | Today | Proposed |
|---------|-------|----------|
| Inline citation `[N]` chip | `bg-brand-500` (`answer-block.tsx:78`) | `bg-primary text-primary-foreground` |
| Sources row pill | `bg-primary/8 text-primary` (`:1117`) | unchanged (already `primary`) — now matches inline |
| Follow-up hover | `brand-50 / brand-300` (`answer-block.tsx:191`) | `primary/5 / primary/30` |
| `CitationCard` active ring | `brand-300/brand-50` (`citation-card.tsx:36`) | `primary/30 / primary/5` |
| Confidence badge | emerald/amber/orange | **keep** (semantic) |
| Warnings | amber | **keep** (semantic) |
| AD / SB tags | red / amber | **keep** (semantic) |

> Optional: introduce a single semantic token `--accent-ai` (default = primary) so all "AI surface" accents share one knob you can rebrand later. Low priority.

### Typography — replace ad-hoc pixels with a scale
Today: `text-[18px]`, `text-[13px]`, `text-[11px]`, `text-[10px]` and inline `style={{ fontWeight: 700 }}` throughout. Move to a small, named scale and **raise the floor to 12px** (audience skews older; 10px is too small).

| Token | Size / weight | Use |
|-------|---------------|-----|
| `text-lg` semibold | 18px / 600 | Page title, empty-state heading |
| `text-sm` | 13–14px / 400 | Answer body, user bubble |
| `text-xs` medium | 12px / 500 | Meta: confidence, scope chip, sources label, timestamps |
| `text-[11px]` | **retire** | Bump to 12px minimum |

Drop inline `style={{fontWeight}}` in favor of `font-medium`/`font-semibold` utilities so weight is themeable.

### Spacing, radius, elevation
- Reuse `--radius` (0.75rem). Cards `rounded-2xl`, chips `rounded-full`, controls `rounded-xl` — already the pattern; apply consistently.
- Use the existing `shadow-card` token for the assistant card instead of a flat border, to lift the answer off the page subtly.
- Borders: `border-border` (already the 8%-alpha token). Avoid one-off `border-border/60`.

### Motion
- **Remove** the 320px→40% sidebar width transition (`:1211`); the drawer slides with `animate-slide-in-right` (already defined, `tailwind.config.ts:125`).
- Streamed tokens: keep, but wrap the answer in a subtle `animate-fade-in` on first paint.
- Respect `prefers-reduced-motion` for the drawer and fade.

### Iconography
- Keep Lucide. Standardize sizes: 16px (`w-4 h-4`) for inline/meta, 18px for header. Today they range 12–20px ad hoc.

---

## 8. Interaction specs (the friction fixes in detail)

### 8.1 Voice → composer
- Delete the floating wrapper in `ask/page.tsx:12-14`.
- Render `<MicButton>` **inside** `AskComposer`, left of the text field.
- Wire `onResult={({transcript}) => setQuestion(q => (q ? q + ' ' : '') + transcript)}`; optionally auto-send when the field was empty and intent confidence is high.
- States already exist in `VoiceButton` (idle/recording/transcribing) — reuse; just shrink to a 32px inline control.

### 8.2 Persona model
- Replace the wipe-on-switch effect (`:593-600`) with a per-persona thread map; switching restores that persona's last conversation.
- If you prefer to keep "switch = fresh," then **confirm first** ("Start a new Mechanic conversation? Your Owner chat is saved in history").
- Rename the in-page toggle copy to plain language if desired: "Owner" / "Mechanic" is fine; the subtitle "Owner mode/Mechanic mode" (`:977`) can become a one-line description of what each does.

### 8.3 Source preview
- Remove `maybeOpenCitation` auto-open (`:674`, `:724`, `:776`). Preview opens **only** on citation click.
- Render `<SourcePreviewDrawer>` as an overlay (mobile already does this at `:929`); the Context panel underneath is untouched.
- Keep ⌘-click → full page and the "Open full page ↗" affordance.

### 8.4 Streaming + Stop
- `useAskStream` exposes `stop()` that aborts the reader.
- During load, the Send button becomes a **Stop** button (square icon), not a disabled spinner (`:1197`).
- Keep the staged status label; show it inline above the composer.

### 8.5 Composer
- Auto-grow `<textarea>` (1→~6 rows), Enter = send, Shift+Enter = newline (today it's an `<input>`; Shift+Enter does nothing useful — `:901`).
- Show a subtle counter only as it approaches the 2000 cap.
- Use the design-system `<Button>` for send/stop with real hover + disabled styles (today it's a bare `<button>` with a `disabled` attr but no disabled visuals — `:1197-1205`).

### 8.6 Answer card anatomy
- **One** confidence indicator (keep the top `ConfidenceBadge`; remove the Sources-row duplicate at `:1158`).
- **One** disclaimer: pin a single compact "AI-generated · verify with your A&P" line under the composer; remove the per-answer copy (`answer-block.tsx:200`). Optionally a one-time expandable on the first answer.
- Add `<AnswerActions>`: **Copy** the answer text, and surface the already-stored `timestamp` (`Message.timestamp`, never rendered today).
- Add a `<ScopeChip>` to each answer header so scope is unambiguous ("N12345" vs "All aircraft").

### 8.7 Suggested prompts & follow-ups
- Keep the hero prompt grid for first run, but also render a **compact horizontal chip row above the composer** that persists after message 1 (today prompts vanish at `:1030`).
- Follow-ups (`answer-block.tsx:184`) are good — restyle to match the chip language and `primary` accent.

### 8.8 Conversations panel
- Add a search field, group by **Today / Earlier / by month**, and inline **rename** (today: flat list, delete-on-hover only, `:1268`).
- Keep the empty state.

### 8.9 Mechanic Quick Tools (later phase)
- Fix `GenerateLogbookDialog` "Use This" to actually carry the generated text into `/maintenance/new` (today it's dropped — `mechanic-tools-panel.tsx:73-81`). Pass via querystring or a draft record.

---

## 9. Accessibility

- **Text floor 12px**; bump all `text-[10px]`/`text-[11px]`.
- **Labels:** the architecture audit already flagged "~10 unlabeled icon buttons" on `/ask-logbook-ai` (`docs/myaircraft-architecture-updates-2026-05-21.md:93`). Add `aria-label` to mic, send/stop, citation pills, delete-thread, drawer close.
- **Streaming:** wrap the in-flight answer in `aria-live="polite"` so screen readers announce it; announce status changes.
- **Focus:** visible focus rings on composer, chips, pills (reuse `--ring`). Trap focus in the source drawer; return focus to the triggering citation on close.
- **Contrast:** white-on-`primary` (navy) passes AA; the retired `brand-500` white text was borderline at small sizes — another reason to unify.
- **Keyboard:** Enter/Shift+Enter in composer; Esc closes the drawer; arrow/Tab through citation pills.
- **Reduced motion:** gate drawer slide + fade on `prefers-reduced-motion`.

---

## 10. Phased implementation plan

Sequenced so polish and broken-wire fixes land first, before any structural change.

| Phase | Scope | Risk | Effort | Key files |
|-------|-------|------|--------|-----------|
| **0 — Polish** | Unify blue → `primary`; remove duplicate confidence; disclaimer once; type-scale + 12px floor; real Button states | Low | ~0.5 day | `answer-block.tsx`, `citation-card.tsx`, `ask-experience.tsx` |
| **1 — Broken wires** | Mic into composer + `onResult`; remove floating mic; persona no-wipe (thread map or confirm); no-docs CTA; Stop button | Low–Med | ~1–1.5 days | `ask/page.tsx`, `VoiceButton.tsx`→`MicButton`, `ask-experience.tsx` |
| **2 — Layout** | Source preview → overlay drawer (kill width swap + auto-open); `ScopeChip` in header + answers; auto-grow textarea; persistent prompt chips | Med | ~2 days | new `SourcePreviewDrawer`, `AskComposer`, `ScopeChip`, `ask-experience.tsx` |
| **3 — Structure & extras** | Split `AskExperience` into the §6 tree; `useAskStream`/`useAskScope`/`useAskThreads`; Conversations search/grouping/rename; Copy + timestamps; a11y sweep | Med | ~2–3 days | new hooks + components |
| **4 — Mechanic tools** | Carry generated logbook/checklist text forward instead of dropping it | Low | ~0.5 day | `mechanic-tools-panel.tsx` |

Phases 0 and 1 are independently shippable and remove most of the *felt* friction. Phase 3's refactor is optional polish — valuable for maintainability but not user-visible.

---

## 11. Open questions (decisions for you)

1. **Persona switch:** preserve a thread per persona (more code, zero data loss) **or** confirm-then-clear (simpler)? My lean: preserve.
2. **Accent:** strictly unify on navy `primary`, or introduce one intentional `--accent-ai` for AI moments? My lean: unify now, add the token later only if you want a distinct AI identity.
3. **Scope vs sidebar selector:** should the in-page scope mirror the owner's sidebar aircraft selector (`AppLayout.tsx:735`), or stay independent (current)? Affects whether selecting an aircraft elsewhere pre-scopes Ask.
4. **Auto-send on voice:** dictate-then-edit (safer) or auto-ask on high-confidence intent (faster)? My lean: dictate-then-edit, with auto-ask as a setting.
5. **Source drawer width** on large screens: fixed ~480px sheet, or the current ~40%?

---

## 12. Out of scope (future)
- Multi-turn answer editing / regenerate.
- Inline aircraft-record actions from an answer (e.g., "log this").
- Cross-aircraft comparison views beyond the existing fan-out.
- Shop-foreman Ask experience (reserved, per `ask-experience.tsx:435`).

---

## Appendix — file map

| Concern | File |
|---------|------|
| Page + floating voice | `apps/web/app/(app)/ask/page.tsx` |
| Owner alias | `apps/web/app/(app)/ask-logbook-ai/page.tsx` |
| Main component | `apps/web/components/ask/ask-experience.tsx` |
| Answer rendering | `apps/web/components/ask/answer-block.tsx` |
| Confidence | `apps/web/components/ask/confidence-badge.tsx` |
| Citation card | `apps/web/components/ask/citation-card.tsx` |
| Source viewer | `apps/web/components/ask/document-viewer.tsx` |
| Mechanic tools | `apps/web/components/ask/mechanic-tools-panel.tsx` |
| Voice | `apps/web/components/voice/VoiceButton.tsx` |
| App shell | `apps/web/components/redesign/AppLayout.tsx` |
| Tokens | `apps/web/app/globals.css`, `apps/web/tailwind.config.ts` |
| API contract | `apps/web/app/api/ask/route.ts` |
