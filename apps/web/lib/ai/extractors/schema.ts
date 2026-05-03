/**
 * Zod schemas for Claude Vision structured output (Spec 7.3).
 *
 * Each extractor returns a JSON object the validator parses into one of
 * these shapes. Failure → caller retries with a stricter prompt; second
 * failure → status='manual_review_needed' on the extraction_results row.
 */

import { z } from 'zod'

/* ─── Shared sub-schemas ──────────────────────────────────────────── */

export const LineItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  quantity: z.number().finite().nonnegative().optional().nullable(),
  unit_price: z.number().finite().nonnegative().optional().nullable(),
  /** Free-form category guess from the model — categorizer.ts maps to enum. */
  category_hint: z.string().optional().nullable(),
})
export type LineItem = z.infer<typeof LineItemSchema>

const TailNumberSchema = z.string()
  .regex(/^[A-Z]?[0-9]{1,5}[A-Z]{0,2}$/i, 'tail number must look like N12345 or G-ABCD')
  .optional()
  .nullable()

/* ─── Extractor outputs ───────────────────────────────────────────── */

export const CostReceiptSchema = z.object({
  doc_kind: z.literal('cost-receipt'),
  vendor: z.string().min(1).optional().nullable(),
  vendor_address: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional().nullable(),
  total_amount: z.number().finite().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable().default('USD'),
  tail_number: TailNumberSchema,
  line_items: z.array(LineItemSchema).default([]),
  notes: z.string().optional().nullable(),
  /** 0-1 self-reported confidence the model has in this extraction. */
  extraction_confidence: z.number().min(0).max(1).default(0.6),
})
export type CostReceipt = z.infer<typeof CostReceiptSchema>

export const MaintenanceInvoiceSchema = z.object({
  doc_kind: z.literal('maintenance-invoice'),
  vendor: z.string().min(1).optional().nullable(),
  vendor_address: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  total_amount: z.number().finite().nonnegative().optional().nullable(),
  labor_total: z.number().finite().nonnegative().optional().nullable(),
  parts_total: z.number().finite().nonnegative().optional().nullable(),
  tax_amount: z.number().finite().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional().nullable().default('USD'),
  tail_number: TailNumberSchema,
  /** Distinguishes "annual inspection" / "100-hour" / "repair" so the
   *  categorizer can default the bucket correctly. */
  service_type: z.enum(['annual_inspection', '100_hour', 'repair', 'other']).default('other'),
  line_items: z.array(LineItemSchema).default([]),
  notes: z.string().optional().nullable(),
  extraction_confidence: z.number().min(0).max(1).default(0.6),
})
export type MaintenanceInvoice = z.infer<typeof MaintenanceInvoiceSchema>

export const InsuranceDeclarationSchema = z.object({
  doc_kind: z.literal('insurance-declaration'),
  carrier: z.string().min(1).optional().nullable(),
  policy_number: z.string().optional().nullable(),
  /** Annual premium in the currency. */
  annual_premium: z.number().finite().nonnegative().optional().nullable(),
  /** Hull value (ground + flight). */
  hull_value: z.number().finite().nonnegative().optional().nullable(),
  liability_limit: z.number().finite().nonnegative().optional().nullable(),
  policy_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  policy_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  currency: z.string().length(3).optional().nullable().default('USD'),
  tail_number: TailNumberSchema,
  insured_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  extraction_confidence: z.number().min(0).max(1).default(0.6),
})
export type InsuranceDeclaration = z.infer<typeof InsuranceDeclarationSchema>

/* ─── Router classification ───────────────────────────────────────── */

export const RouterClassificationSchema = z.object({
  doc_kind: z.enum([
    'cost-receipt',
    'maintenance-invoice',
    'insurance-declaration',
    'unknown',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
})
export type RouterClassification = z.infer<typeof RouterClassificationSchema>
