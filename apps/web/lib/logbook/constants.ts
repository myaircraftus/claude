// Mirror the active logbook_entries CHECK constraints. These include the
// legacy values still in production plus the signed-record workflow statuses.

export const VALID_ENTRY_TYPES = [
  "maintenance",
  "annual",
  "100hr",
  "discrepancy",
  "ad_compliance",
  "sb_compliance",
  "component_replacement",
  "oil_change",
  "return_to_service",
  "major_repair",
  "major_alteration",
  "owner_preventive",
] as const;

export const VALID_STATUSES = [
  "draft",
  "ready_for_review",
  "ready_to_sign",
  "final",
  "signed",
  "published_to_owner",
  "printed_unsigned",
  "superseded",
  "voided",
  "voided_with_reason",
  "amended",
  // Historical: an OCR-transcribed entry from the owner's already-completed
  // paper logbooks. Read-only, owner-visible immediately, not in the mechanic
  // draft -> sign workflow.
  "historical",
] as const;

export const VALID_LOGBOOK_TYPES = [
  "airframe",
  "engine",
  "prop",
  "propeller",
  "avionics",
  "appliance",
  "component",
  "multiple",
] as const;

export type EntryType = typeof VALID_ENTRY_TYPES[number];
export type EntryStatus = typeof VALID_STATUSES[number];
export type LogbookType = typeof VALID_LOGBOOK_TYPES[number];
