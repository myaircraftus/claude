-- Migration 050: expand aircraft.operation_type to support the current onboarding model

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'aircraft'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%operation_type%'
  LOOP
    EXECUTE format('ALTER TABLE aircraft DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE aircraft
  ADD CONSTRAINT aircraft_operation_type_check
  CHECK (
    operation_type IS NULL
    OR operation_type IN (
      'part_91',
      'part_135',
      'part_141',
      'part_61',
      'part_137',
      'part_133',
      'experimental',
      'unknown',
      'private_owner',
      'flight_school',
      'flying_club',
      'leaseback_rental',
      'part_135_charter',
      'corporate_flight_department',
      'government_public_use',
      'special_mission'
    )
  );
