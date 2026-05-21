---
slug: 19-compliance-manual
title: SOC2 Compliance Manual (Master)
module: compliance
order: 19
version: "1.0.0"
last_updated: "2026-05-21"
status: "active"
faa_refs: []
authors: ["Andy Patel"]
---

# SOP-19 — SOC2 Compliance Manual (Master)

> **What this is.** The single document an auditor (or an investor doing
> security diligence) hands to their security team. Every Trust Service
> Criterion that touches myaircraft.us, mapped to the policy, the
> control, the evidence, and the SOP section that documents it in detail.
>
> **What this is not.** A re-statement of the underlying SOPs. Each row
> links to the canonical source — change the source, the matrix follows.

## 1. Scope

myaircraft.us is a multi-tenant SaaS that records aircraft-maintenance
events, signs FAA-grade logbook entries, and surfaces an AI Query Engine
over the resulting corpus. The system is in scope for SOC2 Type II
under the following Trust Service Criteria:

- **Security (CC)** — Common Criteria 6, 7, 8, 9
- **Availability (A)** — A1.1, A1.2, A1.3
- **Confidentiality (C)** — C1.1, C1.2
- **Processing Integrity (PI)** — PI1.1, PI1.4
- **Privacy (P)** — P3.1, P5.1, P8.1

The control matrix mapped against each of these criteria lives at
`/sop-library/compliance` (admin-gated, auditor-facing).

## 2. Document hierarchy

```mermaid
flowchart TD
  manual[SOP-19 — Compliance Manual<br/>this document]
  arch[SOP-13 — Full-stack architecture<br/>§4 RLS · §5 auth · §10 API · §13 encryption · §15 SOC2 posture]
  doc[SOP-14 — Document Persona<br/>The Iron Wall matrix]
  owner[SOP-12 — Owner Portal<br/>§11 privacy · §15 audit · §17 permissions]
  ops[SOP-13 §14 — Backup/DR<br/>+ disaster-recovery runbook]
  integ[SOP-18 — Integrations<br/>OAuth · webhooks · cron · secrets]
  ir[Incident-response runbook<br/>P0–P3 ladder]
  matrix[/sop-library/compliance<br/>auditor-facing control matrix]

  manual --> arch
  manual --> doc
  manual --> owner
  manual --> ops
  manual --> integ
  manual --> ir
  manual --> matrix
```

## 3. Policies (auditor-facing summary)

### 3.1 Access control
- Every authenticated session is bound to a Supabase JWT (1h access token, refresh-rotated).
- Authorization is enforced at four layers: route gate, RLS, API input validator, UI render. See SOP-13 §5, SOP-14 §5.
- Account provisioning: invite-only for staff (SOP-10 §4). Self-serve for owners under a portal-access verification flow (SOP-12 §3).
- Deprovisioning: immediate session revocation + role flip to inactive (SOP-12 §12).

### 3.2 Data classification & confidentiality
- Iron-Wall matrix governs every document. Persona × type × visibility, enforced at the DB. SOP-14 §4.
- `owner_visible` flag is the primary policy bit; defaults vary by type (SOP-14 §7).
- Customer data is NEVER used to train external models (SOP-13 §13.4, public-facing reaffirmation at `/security`).

### 3.3 Encryption
- At rest: AES-256 by Supabase storage layer (SOP-13 §13.2).
- In transit: TLS 1.2+ end-to-end. HTTP redirects to HTTPS. (SOP-13 §13.2).
- OAuth refresh tokens: AES-256-GCM with org-scoped `ENCRYPTION_SECRET`, never in browser bundle (SOP-18 §3.2).

### 3.4 Audit logging
- Every signed logbook entry, owner approval, payment, document touch, and access event writes an `audit_event` row.
- Audit rows include actor, IP, device fingerprint, user-agent, SHA-256 of content. Append-only. SOP-12 §15.
- E-signature audit (`e_signature_audit`) for logbook entries — non-repudiable. SOP-10 §11.3.

### 3.5 Change management
- All changes via PR. Branch protection on `main`. Required: review + green CI + typecheck. SOP-13 §11.2.
- Deploys via Vercel; rollback is one click (SOP-13 §11, DR runbook).
- Database migrations via versioned files in `supabase/migrations/`. Forward-only; rollback by writing a new migration.

### 3.6 Incident response
- P0–P3 severity ladder. Runbook documents detection, triage, containment, eradication, recovery, lessons-learned.
- Sentry + Vercel logs surface incidents in real time. Public security mailbox: `security@myaircraft.us`.
- Post-mortem template included in the runbook; every P0/P1 produces a written post-mortem within 5 business days.

### 3.7 Backup & DR
- Supabase daily snapshots + 5-minute PITR. Vercel one-click rollback (sub-minute RTO).
- Quarterly DR drills documented in the disaster-recovery runbook.
- RTO target: 4 hours. RPO target: 5 minutes.

### 3.8 Vendor governance
- Sub-processor list: Supabase, Vercel, Stripe, OpenAI, Cohere, Google Document AI, Sentry, PostHog. Each is independently SOC2 Type II compliant.
- DPA template available on request (SOP-13 §13.5).
- Annual vendor re-review with attestation refresh.

### 3.9 Privacy & data rights
- GDPR Article 20 — data portability via `/api/owner/export`. SOP-12 §11.3.
- Right to deletion — soft delete + 30-day retention then hard delete via cron. SOP-12 §11.3.
- Privacy Policy at `/legal/privacy`. ToS at `/terms`. Consent captured at signup (SOP-12 §3.2).

## 4. Roles & responsibilities

| Role | Owner | Responsibility |
|---|---|---|
| Security officer | Founder (Andy Patel) | Owns this manual; signs off on SOC2 evidence |
| Engineering lead | Founder + senior staff engineer (open seat) | Implements + tests controls |
| Operations | Founder + ops contractor | Runs DR drills; reviews audit logs monthly |
| Privacy officer | Founder + legal advisor | Handles GDPR/CCPA requests |
| Auditor liaison | Founder | Single point of contact for the audit firm |

## 5. Evidence collection

Quarterly the security officer compiles an evidence packet covering:

1. Access review — list of all users with elevated privilege; attestation by manager.
2. Change log — every production deploy with author + reviewer + ticket reference.
3. Backup verification — restore from snapshot to a scratch project; record success.
4. Vulnerability scan — automated SAST + dependency-audit reports.
5. Incident summary — every P0/P1/P2 incident with link to post-mortem.
6. Vendor attestations — refreshed SOC2 reports from sub-processors.
7. DR drill summary — quarterly drill notes including any deviation from target RTO/RPO.

Evidence is stored in a `compliance/` folder in the data room
(`/investor-room/data-room`).

## 6. Reading order for an auditor

1. This document (SOP-19) — get the lay of the land.
2. SOP-13 — full-stack architecture, multi-tenancy, AI, deployment.
3. SOP-14 — document persona / Iron Wall.
4. SOP-12 — owner portal (consent, audit, data rights).
5. SOP-18 — integrations + webhooks.
6. `/sop-library/compliance` — the live control matrix.
7. Incident-response + disaster-recovery runbooks.

## 7. Open items (transparent gap list)

The matrix at `/sop-library/compliance` carries authoritative status.
This list is the human summary as of the document date.

- **Penetration testing** — engagement scheduled, not yet performed.
- **Cross-region DB replication** — single region (us-east-2). Acceptable for current scale; planned for Series A.
- **GDPR data-export UI** — API live (`/api/owner/export`), UI shipping with Q4 owner-app release.
- **Vendor due-diligence packets** — collected but not yet centralized.
- **Synthetic uptime monitor** — planned `status.myaircraft.us`.
- **SOC2 Type II audit report** — auditor engagement scheduled at seed close.

## 8. Acceptance criteria for this manual

- [ ] Every Trust Service Criterion in scope is mapped in `/sop-library/compliance`.
- [ ] Every row in the matrix links to a specific SOP section.
- [ ] This document is version-controlled and changes go through PR review.
- [ ] Quarterly evidence packets are stored in the data room.
- [ ] An auditor can read this document end-to-end in under an hour and understand the posture.

## 9. References

- SOP-12 — Owner Portal (consent, audit trail, data rights)
- SOP-13 — Full-stack architecture (security, deployment, observability)
- SOP-14 — Document persona / Iron Wall
- SOP-17 — Onboarding & billing (PCI scope reduction)
- SOP-18 — Integrations & webhooks (OAuth, signature verification, secrets)
- `/sop-library/compliance` — auditor-facing control matrix
- `/security` — public-facing version of this manual
- `docs/incident-response-runbook.md`, `docs/disaster-recovery-runbook.md`
