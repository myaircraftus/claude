# Integrations Setup

Settings → Integrations is the click-to-connect surface for OAuth-backed
providers (Google Drive, QuickBooks, FreshBooks). For each tile, the
"Connect" button is enabled only if the corresponding provider credentials
are present in the environment. When credentials are missing, the tile
stays in a polished "Coming soon" state with a tooltip — no broken redirect,
no silent 500.

## Required environment variables

### Google Drive

Used by `/api/gdrive/auth` and `/api/gdrive/callback`. Existing infra.

```bash
GOOGLE_CLIENT_ID=             # Google Cloud OAuth client ID
GOOGLE_CLIENT_SECRET=         # Google Cloud OAuth client secret
GOOGLE_REDIRECT_URI=          # https://<your-domain>/api/gdrive/callback
ENCRYPTION_SECRET=            # AES key used to encrypt stored refresh tokens
```

Scope used: `https://www.googleapis.com/auth/drive.readonly` (PDF imports only).

### QuickBooks Online

Used by `/api/integrations/oauth/start?provider=quickbooks` and
`/api/integrations/oauth/callback`.

```bash
QUICKBOOKS_CLIENT_ID=         # Intuit Developer app client ID
QUICKBOOKS_CLIENT_SECRET=     # Intuit Developer app client secret
QUICKBOOKS_REDIRECT_URI=      # https://<your-domain>/api/integrations/oauth/callback
INTEGRATION_TOKEN_KEY=        # Symmetric key used by lib/integrations/crypto
```

Scope: `com.intuit.quickbooks.accounting`.

### FreshBooks

Used by `/api/integrations/oauth/start?provider=freshbooks` and
`/api/integrations/oauth/callback`.

```bash
FRESHBOOKS_CLIENT_ID=         # FreshBooks developer app client ID
FRESHBOOKS_CLIENT_SECRET=     # FreshBooks developer app client secret
FRESHBOOKS_REDIRECT_URI=      # https://<your-domain>/api/integrations/oauth/callback
```

Scopes: `user:profile:read`, `user:clients:read`, `user:clients:write`,
`user:invoices:read`, `user:invoices:write`.

## Diagnostic endpoint

`GET /api/integrations/registry` returns booleans for each OAuth provider:

```json
{
  "providers": {
    "quickbooks": false,
    "freshbooks": false,
    "googledrive": true
  }
}
```

The Integrations page reads this on mount to decide which tiles can
actually OAuth right now.

## Coming-soon roadmap

The remaining tiles (Flight Schedule Pro, Flight Circle, FlightAware, CAMP,
Flightdocs, etc.) are listed in the directory with their official brand
copy and inline brand SVG, but their Connect button is disabled until we
have partner OAuth credentials. To bring one online:

1. Get OAuth client/secret from the provider.
2. Add a new entry to `lib/integrations/oauth.ts` (`AccountingOAuthProvider`
   union → broaden to a generic `IntegrationOAuthProvider`).
3. Add an exchange/storage block in
   `app/api/integrations/oauth/callback/route.ts`.
4. Update the registry endpoint above so the UI flips that tile from
   "Coming soon" to "Connect".
5. Update the corresponding `ProviderDef` in
   `components/redesign/IntegrationsPage.tsx` from
   `connect: { kind: 'coming_soon' }` to
   `connect: { kind: 'oauth', oauthStartPath, ... }`.
