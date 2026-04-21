import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Escape HTML special characters to prevent injection in PDF/email templates. */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Escape LIKE pattern metacharacters (% _ \) so user input can be used
 *  safely inside an `ilike('%' + input + '%')` filter without wildcards. */
export function escapeLike(str: string): string {
  return String(str).replace(/[\\%_]/g, (m) => '\\' + m)
}

/** Currency formatter (USD, 2 decimals). Shared across invoices/estimates/analytics. */
export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (!Number.isFinite(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .trim()
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  logbook: 'Logbook',
  poh: 'POH',
  afm: 'AFM',
  afm_supplement: 'AFM Supplement',
  maintenance_manual: 'Maintenance Manual',
  service_manual: 'Service Manual',
  parts_catalog: 'Parts Catalog',
  service_bulletin: 'Service Bulletin',
  airworthiness_directive: 'Airworthiness Directive',
  work_order: 'Work Order',
  inspection_report: 'Inspection Report',
  form_337: 'Form 337',
  form_8130: 'Form 8130',
  lease_ownership: 'Lease/Ownership',
  insurance: 'Insurance',
  compliance: 'Compliance',
  miscellaneous: 'Miscellaneous',
}

export const PARSING_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  parsing: 'Parsing',
  chunking: 'Chunking',
  embedding: 'Embedding',
  completed: 'Completed',
  failed: 'Failed',
  needs_ocr: 'Needs OCR',
  ocr_processing: 'OCR Processing',
}

export const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  fleet: 'Fleet',
  enterprise: 'Enterprise',
}
