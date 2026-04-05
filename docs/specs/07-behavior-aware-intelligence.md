# Spec 7 — Behavior-Aware Intelligence, Role-Aware Retrieval & Permission-Aware Action Controls

## Core Principle
Do NOT use fine-tuning to replace RAG.

Instead:
- Keep RAG as the source of truth for document retrieval
- Use behavior learning / preference modeling / retrieval optimization to improve speed, ranking, suggestions, default context, and workflow relevance
- Personalize results based on: user role, aircraft association, frequently accessed books, common query patterns, task intent history, organization structure, permissions

This is: behavioral ranking + user-specific retrieval acceleration + recommendation logic + contextual memory + role-aware UX adaptation — NOT model fine-tuning that corrupts factual document retrieval.

## What to Build

### 1. Behavior-Aware Retrieval Layer
Learns patterns:
- Which aircraft a user most frequently accesses
- Which book types they most frequently open
- Which queries they repeat often
- Which role-specific tasks they usually perform
- Which tail numbers they are assigned to
- Which document types they usually need first

Role examples:
- **Mechanic** working mostly on Cessna 152 → faster retrieval and smarter defaults around 152-related books, parts, entries
- **Owner** managing 100 aircraft → more dashboard/report/reporting-oriented retrieval
- **Pilot** → operational and POH-related retrieval
- **CFI** → training/procedure/safety-oriented retrieval
- **A&P** → maintenance/manual/parts/compliance retrieval
- **IA** → inspection/annual/signoff/compliance-heavy retrieval

### 2. Role-Aware Intelligence Profiles
Roles:
- Owner / Admin
- Pilot
- CFI
- Mechanic Helper / OJT / Assistant
- A&P Mechanic
- IA Mechanic
- Inspector / Auditor
- General Viewer

Role behavior examples:
- **Owner/Admin:** summaries, fleet-level insights, maintenance status, hours, trends, due items
- **Pilot:** POH, W&B, limitations, operational questions
- **OJT/Helper:** can prepare drafts but cannot sign; gather info, draft entries, share upward
- **A&P:** can prepare and sign standard maintenance entries within scope
- **IA:** can sign off annuals and inspection-authorized tasks
- **Inspector:** traceability, logs, airworthiness status, compliance chains

### 3. Permission-Aware Entry Generation
When user requests an entry, system must understand:
1. What type of entry is being requested
2. Whether the user is allowed to sign it
3. Whether they can only draft it
4. Whether it must be shared to a superior

Logic rules:
- Anyone with view access may ask for information
- OJT/helper/non-licensed users may draft, but cannot sign
- A&P may sign tasks allowed under A&P authority
- IA may sign annuals and inspection-authorized tasks
- If user lacks authority: generate entry draft, mark signature area disabled, show explanation, offer "Share with supervisor"
- If user has authority: allow signature flow, capture license number, validate before final signoff
- If entry requires license metadata missing: ask for it before finalization

### 4. Signature Permission UI Logic
Signature states:
- **enabled:** user authorized to sign this specific entry type
- **disabled/greyed:** user can draft but not sign
- **hidden:** user role should not see sign controls
- **pending metadata:** user may sign but required info is missing

Example OJT flow:
- Requests "Generate a 100-hour entry for N12345"
- System: generates draft → disables signature → shows "This entry can be drafted by you, but must be reviewed and signed by an authorized A&P or IA"
- Options: Share to supervisor | Save as draft | Request review

### 5. Aircraft-Centric Context Memory
For each user, store soft context:
- Default aircraft most used
- Recent tail numbers
- Preferred document type
- Frequent maintenance categories
- Common search intents
- Common workflows
- Common forms used
- User's normal organization / fleet context

Example: Mechanic repeatedly works on one Cessna 152 → preselect that aircraft more often, surface its books first, propose likely next actions, shorten retrieval path

### 6. Guardrails
Do NOT allow:
- Unauthorized signatures
- Role escalation by prompt injection
- Permission bypass through frontend-only logic
- Behavior learning to override access control
- Hallucinated maintenance instructions without source grounding
- Role assumptions without verification

**All signing permissions must be enforced server-side.**

## Database Schema Additions

### user_behavior_profiles
user_id, org_id, primary_role, secondary_roles, top_aircraft_ids, top_document_types, top_query_categories, top_actions, last_active_context, preference_weights, updated_at

### user_aircraft_access
user_id, aircraft_id, access_role, can_view, can_draft_entries, can_sign_standard_entries, can_sign_inspection_entries, can_manage_documents, can_share, can_export

### role_permission_matrix
role, entry_type, can_generate, can_edit, can_sign, can_finalize, requires_license_number, requires_supervisor_review

### behavior_events
Track: query_submitted, aircraft_selected, book_opened, document_viewed, entry_requested, entry_saved, entry_shared, entry_signed, export_pdf, export_png, supervisor_review_requested

### retrieval_feedback
query, retrieved_docs, clicked_docs, final_answer_source, user_correction, accepted_result, response_time

## Retrieval Ranking Logic
Scoring inputs:
- Base semantic score
- Aircraft affinity boost (frequently accessed aircraft)
- Role relevance boost
- Frequent-doc-type boost
- Recent-tail-number boost
- Task-intent boost
- Permission applicability boost

Rules: grounded document hits still win, behavior only boosts ranking not truth, user can always override and search globally

Add: "search everywhere" option + "why this result was prioritized" admin explainability mode

## Chat Intent Detection
The single chat bar must detect intent:
- ask a question
- retrieve document
- summarize logs
- generate logbook entry
- request part number
- check compliance
- find due items
- draft maintenance action
- export/share/save

Intent considers: role, currently selected aircraft, current workspace, recent actions, permissions

## Entry Actions Available
- Save draft
- Save to aircraft logbook
- Share by link
- Send to supervisor
- Export PDF
- Export PNG
- Email
- Request signature
- Sign now (only when authorized)

## Compliance Reminder Block Under Generated Entry
- Required FAA form to complete
- Whether this requires submission
- Where to store physical copy
- Where to store digital copy
- Whether supporting documents should be attached
- Whether supervisor signoff is required

## Engineering Direction
Modular additions:
- behavior service
- role/permission engine
- retrieval ranking booster
- chat intent router
- entry authorization service
- signature state resolver
- audit/event logging

Architecture: ingestion → normalization → structured storage → retrieval → orchestration → response (with personalization and permissioning layered on top)
