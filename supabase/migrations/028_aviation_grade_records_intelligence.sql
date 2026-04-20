-- Migration 028: Aviation-grade records intelligence foundations
-- Adds segment-first evidence, versioned canonical truth, corrections, benchmark data,
-- drift monitoring, and downstream evidence gating in a backward-compatible way.

-- ─────────────────────────────────────────────────────────────────────────────
-- OCR entry segmentation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ocr_entry_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_page_job_id UUID NOT NULL REFERENCES ocr_page_jobs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  segment_index INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  segment_group_key TEXT NOT NULL,
  segment_type TEXT NOT NULL
    CHECK (segment_type IN (
      'maintenance_entry',
      'signoff_block',
      'header_template_block',
      'attached_tag',
      'inserted_form',
      'informational_reference_block',
      'table_block',
      'diagram_graph_block',
      'ignore_block'
    )),
  evidence_state TEXT NOT NULL DEFAULT 'review_required'
    CHECK (evidence_state IN (
      'canonical_candidate',
      'informational_only',
      'non_canonical_evidence',
      'review_required',
      'ignore'
    )),
  text_content TEXT NOT NULL DEFAULT '',
  normalized_text TEXT,
  excerpt_text TEXT,
  confidence NUMERIC(5,4),
  source_engine TEXT,
  canonical_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_reason TEXT,
  cross_page_continuation BOOLEAN NOT NULL DEFAULT FALSE,
  previous_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  next_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  neighboring_segment_ids UUID[] NOT NULL DEFAULT '{}',
  bounding_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ocr_page_job_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_ocr_segments_page ON ocr_entry_segments(ocr_page_job_id);
CREATE INDEX IF NOT EXISTS idx_ocr_segments_group ON ocr_entry_segments(segment_group_key);
CREATE INDEX IF NOT EXISTS idx_ocr_segments_state ON ocr_entry_segments(evidence_state);
CREATE INDEX IF NOT EXISTS idx_ocr_segments_doc ON ocr_entry_segments(document_id);

CREATE TABLE IF NOT EXISTS ocr_segment_field_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID NOT NULL REFERENCES ocr_entry_segments(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  candidate_value TEXT,
  normalized_value TEXT,
  source_engine TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'raw_ocr_candidate',
  raw_confidence NUMERIC(5,4),
  validation_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'invalid', 'suspicious')),
  validation_notes TEXT,
  candidate_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seg_field_candidates_seg ON ocr_segment_field_candidates(segment_id);
CREATE INDEX IF NOT EXISTS idx_seg_field_candidates_field ON ocr_segment_field_candidates(field_name);

CREATE TABLE IF NOT EXISTS segment_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID NOT NULL REFERENCES ocr_entry_segments(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  candidate_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflict_reason TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  precedence_decision TEXT,
  chosen_source_kind TEXT,
  chosen_source_engine TEXT,
  human_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending', 'auto_resolved', 'human_resolved', 'rejected')),
  resolved_value TEXT,
  final_resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_conflicts_seg ON segment_conflicts(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_conflicts_status ON segment_conflicts(resolution_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Versioned canonical truth and lineage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS canonical_record_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_event_id UUID NOT NULL REFERENCES maintenance_events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_page_id UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  source_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  source_segment_group_key TEXT,
  version_number INT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  source_kind TEXT NOT NULL DEFAULT 'structured_extraction',
  truth_state TEXT NOT NULL DEFAULT 'canonical'
    CHECK (truth_state IN ('canonical', 'informational_only', 'review_required', 'ignore', 'non_canonical_evidence')),
  precedence_rule TEXT,
  precedence_rank INT,
  arbitration_status TEXT,
  arbitration_confidence NUMERIC(5,4),
  validator_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_reason TEXT,
  created_from_review_queue_item_id UUID REFERENCES review_queue_items(id) ON DELETE SET NULL,
  supersedes_version_id UUID REFERENCES canonical_record_versions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(maintenance_event_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_versions_current
  ON canonical_record_versions(maintenance_event_id)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_canonical_versions_truth_state ON canonical_record_versions(truth_state);
CREATE INDEX IF NOT EXISTS idx_canonical_versions_segment_group ON canonical_record_versions(source_segment_group_key);

CREATE TABLE IF NOT EXISTS canonical_field_lineage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_record_version_id UUID NOT NULL REFERENCES canonical_record_versions(id) ON DELETE CASCADE,
  maintenance_event_id UUID NOT NULL REFERENCES maintenance_events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  chosen_value TEXT,
  chosen_normalized_value TEXT,
  source_page_id UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  source_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  source_engine TEXT,
  source_kind TEXT NOT NULL DEFAULT 'raw_ocr_candidate',
  precedence_rank INT,
  precedence_rule TEXT,
  validator_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validator_status IN ('unvalidated', 'valid', 'invalid', 'suspicious')),
  validator_notes TEXT,
  reviewer_override BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  candidate_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT,
  prompt_version TEXT,
  rule_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_lineage_version ON canonical_field_lineage(canonical_record_version_id);
CREATE INDEX IF NOT EXISTS idx_canonical_lineage_field ON canonical_field_lineage(field_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reviewer corrections and learning queues
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS correction_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aircraft_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  maintenance_event_id UUID REFERENCES maintenance_events(id) ON DELETE SET NULL,
  canonical_record_version_id UUID REFERENCES canonical_record_versions(id) ON DELETE SET NULL,
  review_queue_item_id UUID REFERENCES review_queue_items(id) ON DELETE SET NULL,
  source_page_id UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  source_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  source_segment_group_key TEXT,
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  correction_reason TEXT,
  reviewer_id UUID REFERENCES auth.users(id),
  page_family TEXT,
  document_family TEXT,
  source_model_provider TEXT,
  source_confidence NUMERIC(5,4),
  correction_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correction_events_event ON correction_events(maintenance_event_id);
CREATE INDEX IF NOT EXISTS idx_correction_events_segment ON correction_events(source_segment_id);
CREATE INDEX IF NOT EXISTS idx_correction_events_field ON correction_events(field_name);

CREATE TABLE IF NOT EXISTS learning_queue_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_correction_event_id UUID REFERENCES correction_events(id) ON DELETE CASCADE,
  queue_type TEXT NOT NULL
    CHECK (queue_type IN (
      'prompt_rule_improvement',
      'classifier_retraining',
      'extractor_retraining',
      'benchmark_promotion',
      'failure_pattern_analysis'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_queue_type ON learning_queue_items(queue_type);
CREATE INDEX IF NOT EXISTS idx_learning_queue_status ON learning_queue_items(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Benchmark dataset program
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS benchmark_datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  split TEXT NOT NULL
    CHECK (split IN ('train', 'validation', 'locked_test')),
  schema_version TEXT NOT NULL DEFAULT '1',
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS benchmark_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES benchmark_datasets(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  ocr_page_job_id UUID REFERENCES ocr_page_jobs(id) ON DELETE SET NULL,
  ocr_entry_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  page_family TEXT,
  document_family TEXT,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_items_dataset ON benchmark_items(dataset_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_items_segment ON benchmark_items(ocr_entry_segment_id);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID REFERENCES benchmark_datasets(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES auth.users(id),
  run_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (run_type IN ('manual', 'release_gate', 'regression_check')),
  baseline_label TEXT,
  candidate_label TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  high_risk_regressions JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmark_run_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  benchmark_run_id UUID NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
  benchmark_item_id UUID REFERENCES benchmark_items(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_scope TEXT NOT NULL DEFAULT 'overall',
  expected_value TEXT,
  actual_value TEXT,
  exact_match BOOLEAN,
  normalized_match BOOLEAN,
  precision_value NUMERIC(7,4),
  recall_value NUMERIC(7,4),
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_run_results_run ON benchmark_run_results(benchmark_run_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_run_results_item ON benchmark_run_results(benchmark_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Drift monitoring
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drift_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  snapshot_scope TEXT NOT NULL DEFAULT 'document_family'
    CHECK (snapshot_scope IN ('document', 'document_family', 'provider', 'organization')),
  scope_key TEXT NOT NULL,
  provider_name TEXT,
  document_family TEXT,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  baseline_metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drift_snapshots_scope ON drift_snapshots(snapshot_scope, scope_key, created_at DESC);

CREATE TABLE IF NOT EXISTS quality_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quality_alerts_status ON quality_alerts(status, severity);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend existing tables for compatibility
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ocr_extracted_events
  ADD COLUMN IF NOT EXISTS ocr_entry_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment_group_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_state TEXT
    CHECK (evidence_state IN ('canonical_candidate', 'informational_only', 'non_canonical_evidence', 'review_required', 'ignore'));

ALTER TABLE review_queue_items
  ADD COLUMN IF NOT EXISTS ocr_entry_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_scope TEXT NOT NULL DEFAULT 'page'
    CHECK (review_scope IN ('page', 'segment', 'segment_group', 'ad_conflict')),
  ADD COLUMN IF NOT EXISTS segment_group_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_state TEXT
    CHECK (evidence_state IN ('canonical_candidate', 'informational_only', 'non_canonical_evidence', 'review_required', 'ignore')),
  ADD COLUMN IF NOT EXISTS correction_event_id UUID REFERENCES correction_events(id) ON DELETE SET NULL;

ALTER TABLE field_conflicts
  ADD COLUMN IF NOT EXISTS precedence_decision TEXT,
  ADD COLUMN IF NOT EXISTS chosen_source_kind TEXT,
  ADD COLUMN IF NOT EXISTS chosen_source_engine TEXT,
  ADD COLUMN IF NOT EXISTS human_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS final_resolution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE maintenance_entry_evidence
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS segment_group_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_state TEXT NOT NULL DEFAULT 'canonical'
    CHECK (evidence_state IN ('canonical', 'informational_only', 'review_required', 'ignore', 'non_canonical_evidence'));

ALTER TABLE maintenance_events
  ADD COLUMN IF NOT EXISTS source_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_segment_group_key TEXT,
  ADD COLUMN IF NOT EXISTS current_version_number INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS truth_state TEXT NOT NULL DEFAULT 'legacy'
    CHECK (truth_state IN ('legacy', 'canonical', 'informational_only', 'review_required', 'ignore', 'non_canonical_evidence')),
  ADD COLUMN IF NOT EXISTS current_canonical_version_id UUID REFERENCES canonical_record_versions(id) ON DELETE SET NULL;

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS canonical_record_version_id UUID REFERENCES canonical_record_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activation_state TEXT NOT NULL DEFAULT 'canonical'
    CHECK (activation_state IN ('canonical', 'informational_only', 'review_required', 'ignore')),
  ADD COLUMN IF NOT EXISTS activation_block_reason TEXT;

ALTER TABLE aircraft_ad_applicability
  ADD COLUMN IF NOT EXISTS evidence_segment_id UUID REFERENCES ocr_entry_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canonical_record_version_id UUID REFERENCES canonical_record_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_state TEXT NOT NULL DEFAULT 'review_required'
    CHECK (evidence_state IN ('canonical', 'informational_only', 'review_required', 'ignore', 'non_canonical_evidence')),
  ADD COLUMN IF NOT EXISTS precedence_decision TEXT,
  ADD COLUMN IF NOT EXISTS compliance_source TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ocr_entry_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_segment_field_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_record_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_field_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_run_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_segments" ON ocr_entry_segments
  FOR ALL USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_segment_field_candidates" ON ocr_segment_field_candidates
  FOR ALL USING (
    segment_id IN (SELECT id FROM ocr_entry_segments WHERE organization_id = ANY(get_my_org_ids()))
  );

CREATE POLICY "org_segment_conflicts" ON segment_conflicts
  FOR ALL USING (
    segment_id IN (SELECT id FROM ocr_entry_segments WHERE organization_id = ANY(get_my_org_ids()))
  );

CREATE POLICY "org_canonical_record_versions" ON canonical_record_versions
  FOR ALL USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_canonical_field_lineage" ON canonical_field_lineage
  FOR ALL USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_correction_events" ON correction_events
  FOR ALL USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_learning_queue_items" ON learning_queue_items
  FOR ALL USING (organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_benchmark_datasets" ON benchmark_datasets
  FOR ALL USING (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_benchmark_items" ON benchmark_items
  FOR ALL USING (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_benchmark_runs" ON benchmark_runs
  FOR ALL USING (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_benchmark_run_results" ON benchmark_run_results
  FOR SELECT USING (
    benchmark_run_id IN (
      SELECT id FROM benchmark_runs
      WHERE organization_id IS NULL OR organization_id = ANY(get_my_org_ids())
    )
  );

CREATE POLICY "org_drift_snapshots" ON drift_snapshots
  FOR ALL USING (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()));

CREATE POLICY "org_quality_alerts" ON quality_alerts
  FOR ALL USING (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()))
  WITH CHECK (organization_id IS NULL OR organization_id = ANY(get_my_org_ids()));
