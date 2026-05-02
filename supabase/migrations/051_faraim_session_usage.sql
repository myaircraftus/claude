-- Migration 051: track FARAIM AI search session usage per user.
-- Used for free-tier quota gating: when an org is not paid, has no aircraft,
-- and the trial has expired, users get up to 10 FARAIM sessions before being
-- prompted to upgrade. Paid users / users in orgs with at least one aircraft
-- have unlimited access.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS faraim_session_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faraim_last_session_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.faraim_session_count IS
  'Number of FARAIM embed sessions minted for this user (used for free-tier quota).';
COMMENT ON COLUMN user_profiles.faraim_last_session_at IS
  'When the most recent FARAIM embed session was minted for this user.';
