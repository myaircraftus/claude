# Spec 4 — AviationMX Platform Complete System Design & Wiring Logic

## Platform Overview
Multi-tenant SaaS platform for aviation maintenance record-keeping, aircraft management, logbook sharing, and mechanic credentialing.

## Core Tenets
| Tenet | Description |
|-------|-------------|
| Multi-tenancy | Every organization fully isolated |
| Role hierarchy | Owner → Admin → Mechanic (A&P/IA) → Sub-user (AMP/OJT) |
| Aircraft-centric | Aircraft is the core object; all records attach to it |
| Owner controls access | Aircraft owner always retains sovereignty |
| Mechanic autonomy | Mechanics can have standalone workspace AND link to owners |
| FAA-aware | Certificate numbers, IA currency, Part 43 signing, 7-year retention built in |

## User Roles & Hierarchy

### Role Definitions
- **Owner:** Full control of org, all aircraft, all users
- **Owner-Admin:** Delegated admin for specific aircraft / team management
- **Mechanic (A&P / IA):** Invited by owner OR standalone account; can sign maintenance entries per certificate
- **Sub-User (AMP / OJT / Apprentice):** Added by Mechanic, limited to assigned books/aircraft
- **Read-Only Viewer:** Can view assigned records, cannot write or sign

### Role Capabilities
| Capability | Owner | Admin | A&P | IA | AMP | OJT | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create organization | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add aircraft | ✅ | ✅ | ✅* | ✅* | ❌ | ❌ | ❌ |
| Delete aircraft | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Share aircraft | ✅ | ✅ | ✅** | ✅** | ❌ | ❌ | ❌ |
| Invite mechanics | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite sub-users | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create logbook entries | ✅ | ✅ | ✅ | ✅ | ✅*** | ❌ | ❌ |
| Sign/approve entries | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Countersign (IA only) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

*Mechanic can add aircraft to own workspace; must request link to appear in owner's org
**Mechanic can share aircraft they own with sub-users
***AMP can create draft entries; cannot sign without A&P certificate

## Authentication & Sign-Up Flows

### Supported Auth Methods
- Email + Password (default)
- Google OAuth 2.0
- Microsoft Azure AD (enterprise SSO)
- Magic Link (invited users first-time access)
- Invitation Token

### New Organization Sign-Up Flow (4-step wizard)
1. Choose auth method
2. Organization Setup (name, type, country, contact)
3. Owner Profile (legal name, FAA certificate #, class, IA authorization)
4. Add First Aircraft (N-number lookup, make/model/year/serial)
5. Plan Selection & Billing

## Mechanic Portal & Credentialing

### Mechanic Account Types
1. **Org-linked Mechanic:** Invited by aircraft owner, works within their org
2. **Standalone Mechanic:** Creates own account, can link to any aircraft owner who grants access

### Mechanic Credential Fields
- FAA Certificate Number (A&P)
- Certificate Class (Airframe / Powerplant / Both)
- IA Authorization (Yes/No + expiry date)
- EASA/Transport Canada cert (if applicable)
- License currency status

### Mechanic Sub-Users (AMP/OJT)
- Mechanic can invite AMPs, OJTs, apprentices
- Sub-users limited to books/aircraft mechanic assigns
- Sub-users can draft entries but cannot sign

## Invitation Flows

### Owner → Mechanic Invitation
1. Owner clicks "Invite Mechanic" on aircraft
2. Enter mechanic email + access level (view-only / draft / full maintenance)
3. System sends invitation email with magic link
4. Mechanic accepts → gains access to specified aircraft
5. Owner can revoke at any time

### Mechanic → Sub-User (AMP/OJT) Invitation
1. Mechanic clicks "Add Team Member"
2. Enter email + role (AMP / OJT)
3. System sends invitation email
4. Sub-user accepts → gains limited access per mechanic's permission settings
5. Mechanic can revoke at any time

## Community Library
- Shared repository of: SBs, ADs, AMMs, IPC catalog pages, common forms
- Organization can make documents public to community or keep private
- Search across community library by aircraft type, ATA chapter, document type
- Community contributions reviewed before publishing

## Database Schema Key Tables
- organizations, users, organization_memberships
- aircraft, aircraft_access_grants
- mechanic_credentials, mechanic_sub_users
- logbook_entries, logbook_signatures
- documents, document_pages, document_chunks
- community_library_items
- invitations, invitation_tokens
- billing_subscriptions, billing_events

## API Endpoints Reference
- POST /auth/signup, POST /auth/login, POST /auth/google/callback
- GET/POST /api/organizations
- GET/POST/DELETE /api/aircraft
- POST /api/invitations, POST /api/invitations/accept
- GET/POST /api/mechanics, GET /api/mechanics/credentials
- GET/POST /api/logbook-entries, POST /api/logbook-entries/:id/sign
- GET/POST /api/documents, POST /api/documents/upload
- GET /api/community-library

## Implementation Roadmap
**Phase 1 (Current):** Core multi-tenant auth, aircraft CRUD, basic logbook entries, document upload
**Phase 2:** Mechanic credentialing, invitation flows, sub-user management
**Phase 3:** Community library, advanced sharing, logbook entry signing with certificate validation
**Phase 4:** IA countersign workflow, full FAA Part 43 compliance, audit trail
