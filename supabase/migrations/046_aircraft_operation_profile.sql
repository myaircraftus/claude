-- Migration 046: Aircraft Operation Profile
-- Adds operation type, context JSONB, and AI-suggested document categories to aircraft table

ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS operation_type TEXT CHECK (operation_type IN (
    'part_91', 'part_135', 'part_141', 'part_61', 'part_137', 'part_133', 'experimental', 'unknown'
  )),
  ADD COLUMN IF NOT EXISTS operation_context JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_document_categories TEXT[] DEFAULT '{}';
