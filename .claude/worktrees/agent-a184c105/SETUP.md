# myaircraft.us — Setup Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- Supabase CLI
- Docker (for local parser service)

## 1. Clone & Install

```bash
git clone https://github.com/your-org/myaircraft-us.git
cd myaircraft-us
pnpm install
```

## 2. Environment Variables

```bash
cp .env.local.example apps/web/.env.local
# Fill in all values
```

Required services to set up:
- [Supabase](https://supabase.com) — create a project
- [OpenAI](https://platform.openai.com) — get API key
- [Stripe](https://stripe.com) — create account, get keys
- [Google Cloud Console](https://console.cloud.google.com) — create OAuth app with Drive scope
- [Trigger.dev](https://trigger.dev) — create project
- [Sentry](https://sentry.io) — create project (optional)
- [PostHog](https://posthog.com) — create project (optional)

## 3. Supabase Setup

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run all migrations
supabase db push

# Or run locally
supabase start
supabase db push --local
```

### Storage Buckets (create in Supabase dashboard or CLI)

```bash
supabase storage create-bucket aircraft-documents --no-public
supabase storage create-bucket page-previews --no-public
supabase storage create-bucket org-assets --public
```

### Storage RLS Policies

In the Supabase dashboard, add these policies to `aircraft-documents`:
- Users can upload: `auth.uid() IS NOT NULL`
- Users can read: `auth.uid() IS NOT NULL`

## 4. Stripe Setup

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Create products/prices
stripe products create --name="Pro Plan"
stripe prices create --product=prod_xxx --unit-amount=9900 --currency=usd --recurring[interval]=month

# Forward webhooks locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Set these env vars:
```
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_FLEET=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx
```

## 5. Google Drive OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `https://yourdomain.com/api/gdrive/callback`
6. Copy Client ID and Secret to env vars

## 6. Trigger.dev Setup

```bash
# Install CLI
npm install -g @trigger.dev/cli

# Login
trigger login

# Initialize in trigger/
cd trigger
trigger init

# Deploy jobs
trigger deploy
```

## 7. FastAPI Parser Service

### Local development

```bash
cd apps/parser
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install Tesseract
brew install tesseract  # macOS
# apt-get install tesseract-ocr  # Ubuntu/Debian

# Copy env
cp .env.example .env
# Fill in values

uvicorn main:app --reload --port 8000
```

### Deploy to Railway

```bash
# Install Railway CLI
brew install railway

# Login
railway login

# Create project
railway new

# Link
railway link

# Deploy
railway up
```

Set environment variables in Railway dashboard.

## 8. Next.js Web App

### Local development

```bash
cd apps/web
pnpm dev
# App runs at http://localhost:3000
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel
```

Set all environment variables in Vercel dashboard.

## 9. Post-Deployment Checklist

- [ ] All migrations applied (`supabase db push`)
- [ ] Storage buckets created with correct RLS
- [ ] Stripe webhooks configured and verified
- [ ] Google Drive OAuth redirect URIs updated for production domain
- [ ] Trigger.dev jobs deployed
- [ ] Parser service deployed and accessible
- [ ] PARSER_SERVICE_URL env var set to deployed parser URL
- [ ] First admin user created + `is_platform_admin` set to true in DB
- [ ] Sentry DSNs configured
- [ ] PostHog keys configured

## 10. Database Administration

```bash
# Generate TypeScript types from DB schema
pnpm db:types

# Push new migrations
pnpm db:push

# Open Supabase Studio locally
supabase studio
```

## 11. Making a User Platform Admin

```sql
-- Run in Supabase SQL editor
UPDATE user_profiles
SET is_platform_admin = true
WHERE email = 'admin@yourdomain.com';
```

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js Web   │────▶│   Supabase       │     │  FastAPI Parser │
│   (Vercel)      │     │   - Auth         │◀────│  (Railway)      │
│                 │     │   - Postgres      │     │                 │
│   API Routes    │────▶│   - pgvector      │     │  - PDF parsing  │
│   App Router    │     │   - Storage       │     │  - OCR          │
│   shadcn/ui     │     │   - Realtime      │     │  - Chunking     │
└─────────────────┘     │   - Edge Funcs    │     │  - Embeddings   │
         │              └──────────────────┘     └─────────────────┘
         │                                                 ▲
         ▼                                                 │
┌─────────────────┐     ┌──────────────────┐              │
│   Trigger.dev   │────▶│   OpenAI API     │              │
│   - ingest job  │     │   - Embeddings   │──────────────┘
│   - retry logic │     │   - GPT-4o       │
└─────────────────┘     │   - Vision OCR   │
                        └──────────────────┘
```
