-- Migration 047: Onboarding state columns
-- Adds phone, onboarding_completed_at, and onboarding_context to user_profiles

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_context JSONB DEFAULT '{}'::jsonb;

-- Add cert_number to user_profiles for A&P mechanics
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cert_number TEXT;

-- Add persona column to track owner vs mechanic
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS persona TEXT CHECK (persona IN ('owner', 'mechanic'));

-- Add current_integration tracking to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS current_integration TEXT,
  ADD COLUMN IF NOT EXISTS integration_flags JSONB DEFAULT '{}'::jsonb;
