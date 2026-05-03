-- Migration 079: AI Inspector audit findings (Spec 5.5)
--
-- Widens ai_action_cards.category CHECK to include 'audit-finding' so the
-- AI Inspector can emit cards distinguishable from other categories.
-- Per "add, don't replace" — existing categories stay valid.

ALTER TABLE ai_action_cards
  DROP CONSTRAINT IF EXISTS ai_action_cards_category_check;

ALTER TABLE ai_action_cards
  ADD CONSTRAINT ai_action_cards_category_check
  CHECK (category IN (
    'compliance', 'expiration', 'maintenance', 'approval',
    'anomaly', 'insight',
    'audit-finding'
  ));

COMMENT ON COLUMN ai_action_cards.category IS
  'Spec 0.3 + 5.5 — compliance/expiration/maintenance/approval/anomaly/insight (0c) + audit-finding (5.5).';
