-- 055: give customer_invitations.invite_token a default so inserts don't need
-- to provide one explicitly. Library code relies on the DB generating it.

ALTER TABLE customer_invitations
  ALTER COLUMN invite_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
