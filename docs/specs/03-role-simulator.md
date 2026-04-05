# Spec 3 — Homepage Role Simulator / Interactive Demo Mode

## Goal
Build a premium interactive simulator on the public homepage that lets visitors explore how myaircraft.us works for each aviation role.

## Core Idea
- Part demo center, part product tour, part fake-live sandbox, part "see yourself using it" experience
- NOT a static screenshot — a polished interactive on-page simulator
- Helps visitor understand: "What can this do for me?" and "How would I use this as a mechanic / IA / owner / pilot / buyer / FAA inspector?"

## Component Name
`RoleSimulatorSection` (already built ✅)

Child components: RoleSimulatorShell, RoleSelectorRail, ScenarioLibraryPanel, SimulatorCanvas, PromptExamplesPanel, AnswerPreviewCard, SourceCitationStack, ActionTray, RoleOutcomeSummary

## Layout
- **Desktop:** left rail (role selector) | center (simulator canvas) | right panel (scenarios, prompts, outputs)
- **Mobile:** horizontal role chips → simulator canvas → collapsible scenarios → prompts below

## Roles (8)
1. Mechanic / A&P
2. IA
3. Aircraft Owner
4. Pilot
5. FAA Inspector
6. Aircraft Buyer / Prebuy
7. Dealer / Broker
8. Flight School / Fleet Admin

Each role: icon, title, one-line summary, 4–8 scenarios, 6–12 example queries, 1–3 simulated result views

## Simulator Shell Contains
- Top mini header
- Selected aircraft badge / tail number
- Role badge
- Search / ask bar
- Results area with citations
- Optional doc/source preview pane
- Optional quick action tray

## Role-Specific Scenarios

### Mechanic / A&P
Prompts: "Find the part number for the left main gear actuator", "Show the last 100-hour inspection entry", "Find all logbook references to alternator replacement", "What documents mention corrosion treatment?"
Outputs: answer card, cited source list, document preview, part number table, "Create logbook entry" action

### IA
Prompts: "Show me all annual inspection references for the last 3 years", "List any AD compliance references found in the records", "Find all Form 337 mentions", "Summarize the evidence supporting airworthiness"
Outputs: compliance summary panel, cited annual/AD/337 cards, evidence stack, confidence indicator

### Aircraft Owner
Prompts: "When was the last annual inspection completed?", "What major maintenance has been done in the last 2 years?", "Has the propeller ever been overhauled?"
Outputs: clean owner-friendly answer, simplified explanation, citations, timeline cards, "Share records" CTA

### Pilot
Prompts: "What is the max demonstrated crosswind in this POH?", "Show the fuel capacity for this aircraft", "What required inspections should I verify before flight?"
Outputs: POH answer card, handbook citation, highlighted document section

### FAA Inspector
Prompts: "Show records supporting the most recent annual inspection", "List references to major repairs or alterations", "What evidence supports current airworthiness?"
Outputs: evidence stack view, cited records list, inspection summary panel, completeness warnings

### Aircraft Buyer / Prebuy
Prompts: "Summarize the major maintenance history for a prebuy review", "Show any references to damage, corrosion, or structural repair", "What records are missing or unclear?"
Outputs: prebuy summary, risk flags, supporting evidence cards, confidence labels, export CTA

### Dealer / Broker
Prompts: "Create a buyer-friendly maintenance summary", "Show the strongest records that support value", "Prepare a shareable source-backed record overview"
Outputs: listing-ready summary, aircraft highlights panel, share-by-link CTA, export PDF CTA

### Fleet Admin
Prompts: "Which records show the latest 100-hour inspection?", "Find all brake-related writeups for this aircraft", "Show document categories available for N12345"
Outputs: fleet admin dashboard card, inspection status tiles, repeated discrepancy log

## Data Model
File: `src/data/roleSimulatorData.ts` (already created ✅)

```ts
type SimulatorRole = 'mechanic' | 'ia' | 'owner' | 'pilot' | 'faaInspector' | 'buyer' | 'dealer' | 'fleetAdmin';
interface RoleScenario {
  id, title, summary, prompt, answerTitle, answerBody, confidence,
  sourceCards: { label, docType, page, snippet }[],
  quickActions, relatedDocs, nextQuestions
}
interface RoleDefinition { id, label, shortLabel, icon, description, benefits, scenarios }
```

## Source Citation Presentation
Every simulated answer must show:
- Source card with page pill
- Confidence badge
- Document type chip
- Highlighted excerpt
- "View source page" / "Open document" / "Copy summary" / "Share"

Examples: "Logbook Entry · Page 47", "POH Section 2 · Page 2-8", "IPC Figure 32-10 · Page 134", "Form 337 · Page 1"

## Default Experience on Load
- Default role = Mechanic or Owner
- Show 3 top example prompts immediately
- Animate first answer in after slight delay
- Clear headline + supporting copy
- Obvious role tabs and CTA

## Sample Aircraft Contexts
- Cessna 172S (N8202L)
- Piper PA-28-181 (N4409K)
- Beechcraft Baron 58 (N2240E)
