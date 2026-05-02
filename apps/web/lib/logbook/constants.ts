// Mirror of migration 016 CHECK constraints for logbook_entries table.
// Kept in sync with the DB so server-side validation matches the column constraints.

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

export const VALID_STATUSES = ["draft", "final", "signed", "amended"] as const;

export const VALID_LOGBOOK_TYPES = [
  "airframe",
  "engine",
  "prop",
  "avionics",
  "multiple",
] as const;

export type EntryType = typeof VALID_ENTRY_TYPES[number];
export type EntryStatus = typeof VALID_STATUSES[number];
export type LogbookType = typeof VALID_LOGBOOK_TYPES[number];
