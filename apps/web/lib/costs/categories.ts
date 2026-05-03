/**
 * Cost categories + bucket mapping (Spec 7.1).
 *
 * The DB stores `category` as free-form TEXT — no CHECK — so future
 * Phase 7 sprints can add categories without a migration. The seed
 * list lives here; the form's dropdown reads it. The default bucket
 * map drives the per-hour calculator's amortization (7.4) when the
 * operator picks a category and accepts the suggested bucket.
 */

export type CostCategory =
  | 'fuel'
  | 'oil'
  | 'tiedown'
  | 'hangar'
  | 'insurance'
  | 'annual_inspection'
  | '100_hour'
  | 'engine_overhaul_reserve'
  | 'prop_overhaul_reserve'
  | 'avionics_database'
  | 'parts'
  | 'labor'
  | 'outside_service'
  | 'tax_property'
  | 'tax_use'
  | 'loan_payment'
  | 'depreciation'
  | 'training'
  | 'subscription_software'
  | 'other'

export type CostBucket =
  | 'variable_per_hour'
  | 'scheduled_per_hour'
  | 'annual_fixed'
  | 'monthly_fixed'
  | 'one_time'
  | 'loan'
  | 'depreciation'

/** Default bucket per category — operator can override per entry. */
export const DEFAULT_BUCKET: Record<CostCategory, CostBucket> = {
  fuel:                     'variable_per_hour',
  oil:                      'variable_per_hour',
  tiedown:                  'monthly_fixed',
  hangar:                   'monthly_fixed',
  insurance:                'annual_fixed',
  annual_inspection:        'annual_fixed',
  '100_hour':               'scheduled_per_hour',
  engine_overhaul_reserve:  'scheduled_per_hour',
  prop_overhaul_reserve:    'scheduled_per_hour',
  avionics_database:        'monthly_fixed',
  parts:                    'one_time',
  labor:                    'one_time',
  outside_service:          'one_time',
  tax_property:             'annual_fixed',
  tax_use:                  'one_time',
  loan_payment:             'loan',
  depreciation:             'depreciation',
  training:                 'one_time',
  subscription_software:    'monthly_fixed',
  other:                    'one_time',
}

/** Display label per category. */
export const CATEGORY_LABEL: Record<CostCategory, string> = {
  fuel:                     'Fuel',
  oil:                      'Oil',
  tiedown:                  'Tiedown',
  hangar:                   'Hangar',
  insurance:                'Insurance',
  annual_inspection:        'Annual Inspection',
  '100_hour':               '100-Hour Inspection',
  engine_overhaul_reserve:  'Engine Overhaul Reserve',
  prop_overhaul_reserve:    'Prop Overhaul Reserve',
  avionics_database:        'Avionics Database',
  parts:                    'Parts',
  labor:                    'Labor',
  outside_service:          'Outside Service',
  tax_property:             'Property Tax',
  tax_use:                  'Use Tax',
  loan_payment:             'Loan Payment',
  depreciation:             'Depreciation',
  training:                 'Training',
  subscription_software:    'Software Subscription',
  other:                    'Other',
}

export const ALL_CATEGORIES: readonly CostCategory[] = Object.keys(DEFAULT_BUCKET) as CostCategory[]

export const BUCKET_LABEL: Record<CostBucket, string> = {
  variable_per_hour:  'Variable (per hour)',
  scheduled_per_hour: 'Scheduled (per hour)',
  annual_fixed:       'Annual fixed',
  monthly_fixed:      'Monthly fixed',
  one_time:           'One-time',
  loan:               'Loan',
  depreciation:       'Depreciation',
}
