-- Cross-cutting Concern 2 — Parent hierarchy on Aircraft + Vendor
--
-- locations.parent_location_id already exists from migration 059a; this
-- migration only adds the aircraft + vendor parent FKs.
--
-- aircraft.parent_aircraft_id supports fleet → aircraft → engine grouping
-- (when SerialComponents land, an engine row can hang off an aircraft row).
-- vendors.parent_vendor_id supports parent vendor → branch hierarchies.
-- Both are SET NULL on parent delete so removing a parent doesn't cascade.

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS parent_aircraft_id uuid REFERENCES aircraft(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aircraft_parent_idx
  ON aircraft (organization_id, parent_aircraft_id)
  WHERE parent_aircraft_id IS NOT NULL;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS parent_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendors_parent_idx
  ON vendors (organization_id, parent_vendor_id)
  WHERE parent_vendor_id IS NOT NULL;
