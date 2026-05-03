/**
 * Line-item → CostCategory mapper (Spec 7.3 helper).
 *
 * Heuristics first — covers ~95% of real receipt lines without an LLM
 * call. Tax / tip / shipping land in 'other'. The router-side LLM
 * already provided a category_hint on each line; we trust it when
 * present and only fall back to keyword scan when missing.
 */

import { DEFAULT_BUCKET, type CostCategory } from '@/lib/costs/categories'

interface CategorizeArgs {
  description?: string | null
  hint?: string | null
}

/** Returns the category + the default bucket the calculator should use. */
export function categorizeLineItem(args: CategorizeArgs): { category: CostCategory; bucket: ReturnType<typeof bucketFor> } {
  const cat = pickCategory(args)
  return { category: cat, bucket: bucketFor(cat) }
}

function pickCategory({ description, hint }: CategorizeArgs): CostCategory {
  const txt = `${description ?? ''} ${hint ?? ''}`.toLowerCase()

  // Hint wins when present and unambiguous.
  if (/\bfuel\b|100ll|jet[\s-]?a|avgas|gasoline/.test(txt)) return 'fuel'
  if (/\boil\b|aeroshell|phillips\s*x[ce]?|w100|w80/.test(txt))       return 'oil'
  if (/labor|labour|tech\s*time|mechanic\s*time|hours\s*at/.test(txt)) return 'labor'
  if (/outside\s*service|osr\b|sublet|3rd[\s-]?party/.test(txt))      return 'outside_service'
  if (/\b(annual|annual\s*inspection)\b/.test(txt))                   return 'annual_inspection'
  if (/\b100[\s-]?hour\b|\b100hr\b/.test(txt))                         return '100_hour'
  if (/\bhangar\b|hanger/.test(txt))                                  return 'hangar'
  if (/tie[\s-]?down/.test(txt))                                      return 'tiedown'
  if (/insurance|premium|policy/.test(txt))                           return 'insurance'
  if (/jeppesen|garmin\s*data|navdata|chartview|foreflight/.test(txt)) return 'avionics_database'
  if (/training|cfi|recurrent|wings\s*program/.test(txt))             return 'training'
  if (/subscription|monthly\s*sub/.test(txt))                         return 'subscription_software'
  if (/property\s*tax/.test(txt))                                     return 'tax_property'
  if (/use\s*tax|sales\s*tax/.test(txt))                              return 'tax_use'
  if (/loan|payment\s*due|principal/.test(txt))                       return 'loan_payment'
  if (/depreciation|amort/.test(txt))                                 return 'depreciation'
  if (/cylinder|magneto|spark\s*plug|tire|battery|filter|gasket|hose|bracket|seal|spinner|alternator|starter|prop\s*hub|harness/.test(txt)) return 'parts'
  if (/parts?|kit|assembly/.test(txt))                                return 'parts'
  return 'other'
}

function bucketFor(c: CostCategory) {
  return DEFAULT_BUCKET[c]
}
