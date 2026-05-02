-- 054: customers.portal_user_id — binds a customer record to a signed-up user
-- who accepted an invite. `portal_access` already exists as a boolean flag;
-- the uuid linkage needed its own column.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_user_id uuid
  REFERENCES user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customers_portal_user_id_idx
  ON customers(portal_user_id)
  WHERE portal_user_id IS NOT NULL;
