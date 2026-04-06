-- Migration 002: Organizations & Users

CREATE TABLE organizations (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  plan                    TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'fleet', 'enterprise')),
  plan_aircraft_limit     INT NOT NULL DEFAULT 1,
  plan_storage_gb         NUMERIC(10,2) NOT NULL DEFAULT 2.0,
  plan_queries_monthly    INT NOT NULL DEFAULT 100,
  queries_used_this_month INT NOT NULL DEFAULT 0,
  queries_reset_at        TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  logo_url                TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT,
  avatar_url        TEXT,
  job_title         TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_memberships (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'mechanic', 'viewer', 'auditor')),
  invited_by      UUID REFERENCES user_profiles(id),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_memberships_org ON organization_memberships(organization_id);
CREATE INDEX idx_org_memberships_user ON organization_memberships(user_id);

-- Function to increment query count
CREATE OR REPLACE FUNCTION increment_query_count(p_org_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE organizations
  SET queries_used_this_month = queries_used_this_month + 1
  WHERE id = p_org_id;
$$;
