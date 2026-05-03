-- Migration 085 — Predictive Maintenance category (Spec 5.3)
--
-- Widens ai_action_cards.category CHECK to include 'prediction' so the
-- nightly predictor cron can emit cards for compression / oil-consumption
-- / component-failure predictions distinguishable from other categories.
-- Same pattern as 079 audit-finding.

ALTER TABLE ai_action_cards
  DROP CONSTRAINT IF EXISTS ai_action_cards_category_check;

ALTER TABLE ai_action_cards
  ADD CONSTRAINT ai_action_cards_category_check
  CHECK (category IN (
    'compliance', 'expiration', 'maintenance', 'approval',
    'anomaly', 'insight',
    'audit-finding',
    'prediction'
  ));

COMMENT ON COLUMN ai_action_cards.category IS
  'Spec 0.3 + 5.5 + 5.3 — compliance/expiration/maintenance/approval/anomaly/insight + audit-finding + prediction.';
