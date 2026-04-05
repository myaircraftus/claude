export interface AircraftComputedStatus {
  id: string
  aircraft_id: string
  organization_id: string
  computed_at: string

  airframe_total_time: number | null
  airframe_time_source_date: string | null

  engine_time_since_new: number | null
  engine_time_since_overhaul: number | null
  engine_last_overhaul_date: string | null
  engine_last_overhaul_shop: string | null
  engine_tbo_hours: number | null
  engine_hours_to_tbo: number | null

  prop_time_since_new: number | null
  prop_time_since_overhaul: number | null
  prop_last_overhaul_date: string | null

  last_annual_date: string | null
  last_annual_aircraft_time: number | null
  annual_next_due_date: string | null
  annual_is_current: boolean

  last_100hr_date: string | null
  last_100hr_aircraft_time: number | null
  next_100hr_due_time: number | null

  last_elt_inspection_date: string | null
  elt_next_due_date: string | null
  elt_is_current: boolean

  last_transponder_test_date: string | null
  transponder_next_due_date: string | null
  transponder_is_current: boolean

  last_pitot_static_date: string | null
  pitot_static_next_due_date: string | null
  pitot_static_is_current: boolean

  last_altimeter_date: string | null
  altimeter_next_due_date: string | null
  altimeter_is_current: boolean

  last_vor_check_date: string | null
  vor_check_next_due_date: string | null
  vor_check_is_current: boolean

  total_applicable_ads: number
  ads_complied: number
  ads_open: number
  ads_unknown: number
  next_ad_due_date: string | null
  next_ad_number: string | null

  has_registration: boolean
  registration_expiry_date: string | null
  has_airworthiness_cert: boolean
  has_weight_balance: boolean
  has_equipment_list: boolean

  health_score: number
  health_score_breakdown: Record<string, number>

  created_at: string
  updated_at: string
}

export interface RecordFinding {
  id: string
  aircraft_id: string
  organization_id: string
  findings_run_id: string

  finding_type: string
  severity: 'critical' | 'warning' | 'info'

  title: string
  description: string
  recommendation: string | null

  affected_date_start: string | null
  affected_date_end: string | null
  affected_component: string | null

  source_event_ids: string[] | null
  source_document_ids: string[] | null

  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null

  is_acknowledged: boolean
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledge_note: string | null

  created_at: string
}

export interface FindingsRun {
  id: string
  aircraft_id: string
  organization_id: string
  triggered_by: string | null
  trigger_source: string
  status: 'running' | 'completed' | 'failed'
  findings_count: number
  critical_count: number
  warning_count: number
  info_count: number
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface ReportJob {
  id: string
  aircraft_id: string
  organization_id: string
  requested_by: string | null

  report_type: 'aircraft_overview' | 'engine_prop_summary' | 'inspection_status' | 'maintenance_timeline' | 'missing_records' | 'prebuy_packet' | 'lender_packet' | 'insurer_packet'
  status: 'queued' | 'generating' | 'completed' | 'failed'

  options: Record<string, unknown>

  stripe_payment_intent_id: string | null
  is_paid: boolean

  share_token: string | null
  share_token_expires_at: string | null
  share_accessed_count: number

  storage_path: string | null
  signed_url: string | null
  signed_url_expires: string | null
  file_size_bytes: number | null

  generation_started_at: string | null
  generation_completed_at: string | null
  error_message: string | null

  created_at: string
  updated_at: string
}
