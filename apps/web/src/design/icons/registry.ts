/**
 * myaircraft.us — custom SVG icon registry
 *
 * Each entry is the INNER markup of an icon only (paths, circles, etc.).
 * The <Icon> component wraps these in a 24x24 <svg> with
 * fill="none" stroke="currentColor" strokeLinecap/Linejoin="round".
 *
 * Designed on a 24px grid in the Lucide/Feather style: clean, geometric,
 * professional. Filled shapes opt in explicitly with fill="currentColor".
 *
 * Zero external dependencies — every path is hand-authored.
 */

/**
 * The icon registry. Keys are kebab-case icon names; values are JSX-free
 * SVG inner-markup strings rendered via dangerouslySetInnerHTML in <Icon>.
 *
 * `as const` makes every key a literal so `IconName` is a precise union.
 */
export const iconRegistry = {
  // ─── NAVIGATION ──────────────────────────────────────────────────────────
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  aircraft:
    '<path d="M3 13l8-1V5.5a1 1 0 0 1 2 0V12l8 1v2l-8-1v4l2.5 2v1.5L12 20l-3.5 1.5V20L11 18v-4l-8 1z"/>',
  documents:
    '<path d="M7 3h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><polyline points="14 3 14 8 19 8"/><path d="M3 8v11a2 2 0 0 0 2 2h10"/>',
  marketplace:
    '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.41.59l6.5 6.5a2 2 0 0 1 0 2.83l-7.5 7.5a2 2 0 0 1-2.83 0l-6.5-6.5A2 2 0 0 1 3 12.5z"/><circle cx="8" cy="8" r="1.5"/>',
  'my-listings':
    '<line x1="3" y1="6" x2="13" y2="6"/><line x1="3" y1="12" x2="11" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/><path d="M19.5 11.5l2.5 2.5-6 6H13.5v-2.5z"/>',
  'seller-dashboard':
    '<line x1="3" y1="21" x2="21" y2="21"/><rect x="4" y="13" width="4" height="8" rx="0.5"/><rect x="10" y="9" width="4" height="12" rx="0.5"/><rect x="16" y="4" width="4" height="17" rx="0.5"/>',
  'create-listing':
    '<path d="M3 11V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.41.59l7.5 7.5a2 2 0 0 1 0 2.83l-6.5 6.5a2 2 0 0 1-2.83 0L3.59 12.41" opacity="0"/><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/>',
  community:
    '<circle cx="12" cy="7" r="3"/><circle cx="5.5" cy="10" r="2.5"/><circle cx="18.5" cy="10" r="2.5"/><path d="M5 21v-2a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 19 19v2"/><path d="M2 21v-1.5A2.5 2.5 0 0 1 4.5 17"/><path d="M22 21v-1.5A2.5 2.5 0 0 0 19.5 17"/>',
  maintenance:
    '<path d="M14.5 5.5a3.5 3.5 0 0 0-4.6 4.4L4 15.8l2.2 2.2 5.9-5.9a3.5 3.5 0 0 0 4.4-4.6l-2.2 2.2-1.9-.5-.5-1.9z"/><path d="M14 14l5 5"/><path d="M16.5 11.5L20 8l-2-2-3.5 3.5"/>',
  workforce:
    '<path d="M5 14a7 7 0 0 1 14 0"/><line x1="3.5" y1="14" x2="20.5" y2="14"/><path d="M9.5 7.2V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.2"/><circle cx="12" cy="19" r="2.5"/><path d="M7 22a5 5 0 0 1 10 0"/>',
  expiration:
    '<rect x="3" y="5" width="13" height="13" rx="2"/><line x1="3" y1="9" x2="16" y2="9"/><line x1="7" y1="3" x2="7" y2="6"/><line x1="12" y1="3" x2="12" y2="6"/><circle cx="17" cy="17" r="5"/><polyline points="17 14.5 17 17 18.8 18.8"/>',
  reports:
    '<path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 6"/><polyline points="16 6 20 6 20 10"/>',
  'far-aim':
    '<path d="M12 6.5C10.5 5 8 4 4 4v13c4 0 6.5 1 8 2.5"/><path d="M12 6.5C13.5 5 16 4 20 4v13c-4 0-6.5 1-8 2.5z"/><path d="M12 6.5v13"/><path d="M15.5 4v6l2-1.5 2 1.5V4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  help:
    '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 0 1 5.5.8c0 1.9-2.8 2.5-2.8 4"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'sign-out':
    '<path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><polyline points="17 8 21 12 17 16"/><line x1="21" y1="12" x2="9" y2="12"/>',
  admin:
    '<path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="9 12 11 14 15 9.5"/>',

  // ─── MARKETPLACE ─────────────────────────────────────────────────────────
  'part-lookup':
    '<circle cx="10.5" cy="10.5" r="6"/><line x1="20" y1="20" x2="14.8" y2="14.8"/><path d="M10.5 5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L8 7.5l1.8-.7z" fill="currentColor"/>',
  'ai-autofill':
    '<path d="M4 20l9-9"/><path d="M11.5 6.5l3 3"/><path d="M14 4l.8 1.7 1.7.8-1.7.8L14 9l-.8-1.7L11.5 6.5l1.7-.8z" fill="currentColor"/><path d="M19 9l.6 1.4 1.4.6-1.4.6L19 13l-.6-1.4L17 11l1.4-.6z" fill="currentColor"/><path d="M18.5 16l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor"/>',
  'condition-new':
    '<path d="M12 2.5l1.6 4.4 4.4-1.6-1.6 4.4 4.4 1.6-4.4 1.6 1.6 4.4-4.4-1.6L12 21.5l-1.6-4.4-4.4 1.6 1.6-4.4L2.8 12.5l4.4-1.6L5.6 6.5l4.4 1.6z"/><circle cx="12" cy="12" r="3"/>',
  'condition-overhauled':
    '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12a9 9 0 0 1 15.5-6.2"/><polyline points="21 4 21 9 16 9"/><polyline points="3 20 3 15 8 15"/>',
  'condition-serviceable':
    '<path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="8.5 11.5 11 14 15.5 9"/>',
  'condition-used':
    '<circle cx="12" cy="12.5" r="8"/><polyline points="12 8 12 12.5 15 14.5"/><polyline points="12 2.5 14.5 5 12 7.5"/><path d="M14.5 5H10a8 8 0 0 0-7 4"/>',
  'condition-repair':
    '<path d="M14.5 5.5a3.5 3.5 0 0 0-4.6 4.4L4 15.8l2.2 2.2 5.9-5.9a3.5 3.5 0 0 0 4.4-4.6l-2.2 2.2-1.9-.5-.5-1.9z"/><path d="M16 16l4 4"/><path d="M18 15l3 3"/>',
  'part-engine':
    '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/><line x1="4.2" y1="4.2" x2="7" y2="7"/><line x1="17" y1="17" x2="19.8" y2="19.8"/><line x1="19.8" y1="4.2" x2="17" y2="7"/><line x1="7" y1="17" x2="4.2" y2="19.8"/>',
  'part-avionics':
    '<rect x="2.5" y="4" width="19" height="13" rx="2"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="6" y1="13" x2="6" y2="11"/><line x1="9.5" y1="13" x2="9.5" y2="9"/><line x1="13" y1="13" x2="13" y2="10"/><line x1="16.5" y1="13" x2="16.5" y2="7.5"/>',
  'part-instruments':
    '<circle cx="12" cy="12" r="9"/><path d="M4 12a8 8 0 0 1 16 0z" fill="currentColor" stroke="none" opacity="0.18"/><path d="M3 12h18"/><path d="M7 16.5l5-4.5 5 4.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  'part-landing-gear':
    '<circle cx="12" cy="17" r="4"/><circle cx="12" cy="17" r="1"/><path d="M12 13V6"/><path d="M12 6h-4"/><path d="M12 6h4"/><path d="M8 6l-2-2"/><path d="M16 6l2-2"/>',
  'part-propeller':
    '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 0-8s-4 2-4 5 2 3 4 3z"/><path d="M12 14c0 4-1 7 0 8s4-2 4-5-2-3-4-3z"/><path d="M10 12c-4 0-7-1-8 0s2 4 5 4 3-2 3-4z"/><path d="M14 12c4 0 7 1 8 0s-2-4-5-4-3 2-3 4z"/>',
  'part-airframe':
    '<circle cx="12" cy="12" r="9"/><path d="M5 9h14"/><path d="M5 15h14"/><path d="M8 21V3"/><path d="M16 21V3"/>',
  'part-interior':
    '<path d="M6 4v9a3 3 0 0 0 3 3h7"/><path d="M6 13a3 3 0 0 0-3 3v4h4"/><path d="M16 9h2a2 2 0 0 1 2 2v9h-4"/><path d="M10 20v-4h6"/>',
  'part-hardware':
    '<path d="M12 3.2l5 2.9v5.8l-5 2.9-5-2.9V6.1z"/><circle cx="12" cy="9" r="2.5"/><line x1="12" y1="14.8" x2="12" y2="21"/><polyline points="9.5 18.5 12 21 14.5 18.5"/>',
  'part-fuel':
    '<path d="M12 2.5C8 7 5.5 10.5 5.5 14a6.5 6.5 0 0 0 13 0c0-3.5-2.5-7-6.5-11.5z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>',
  'part-lighting':
    '<path d="M9 14a5 5 0 1 1 6 0c-.6.5-1 1.2-1 2v.5h-4V16c0-.8-.4-1.5-1-2z"/><line x1="10" y1="20" x2="14" y2="20"/><line x1="10.5" y1="22" x2="13.5" y2="22"/><line x1="12" y1="2" x2="12" y2="1" opacity="0"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="18" y1="4" x2="19.5" y2="3"/><line x1="6" y1="4" x2="4.5" y2="3"/>',
  'part-safety':
    '<rect x="3" y="5" width="18" height="14" rx="3"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/>',
  'contact-phone':
    '<path d="M6.5 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 4.5 5a2 2 0 0 1 2-2z"/>',
  'contact-email':
    '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
  'contact-location':
    '<path d="M12 21.5C7 16.5 5 13 5 9.5a7 7 0 0 1 14 0c0 3.5-2 7-7 12z"/><circle cx="12" cy="9.5" r="2.7"/>',
  'contact-text':
    '<path d="M21 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><line x1="8.5" y1="10" x2="8.51" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/><line x1="15.5" y1="10" x2="15.51" y2="10"/>',
  'save-listing':
    '<path d="M12 20.5C7 16.5 3.5 13 3.5 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 2.8c0 4.2-3.5 7.7-8.5 11.7z"/>',
  'save-listing-filled':
    '<path d="M12 20.5C7 16.5 3.5 13 3.5 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 2.8c0 4.2-3.5 7.7-8.5 11.7z" fill="currentColor"/>',
  'share-listing':
    '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="5.5" r="3"/><circle cx="18" cy="18.5" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.9"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.1"/>',
  'report-listing':
    '<line x1="5" y1="3" x2="5" y2="22"/><path d="M5 4h11l-2.5 4L16 12H5z"/>',
  'mark-sold':
    '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.41.59l6.5 6.5a2 2 0 0 1 0 2.83l-7.5 7.5a2 2 0 0 1-2.83 0l-6.5-6.5A2 2 0 0 1 3 12.5z"/><polyline points="8.5 11 11 13.5 16 8.5"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/>',
  'review-token':
    '<path d="M9 13l6-6"/><path d="M10.5 5.5l1.2-1.2a3.5 3.5 0 0 1 5 5L15.5 10.5"/><path d="M13.5 18.5l-1.2 1.2a3.5 3.5 0 0 1-5-5L8.5 13.5"/><path d="M19 14l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" fill="currentColor"/>',
  'verified-seller':
    '<path d="M12 2.4l2.3 1.9 3-.3 1.2 2.8 2.6 1.5-.7 2.9.7 2.9-2.6 1.5-1.2 2.8-3-.3L12 21.6l-2.3-1.9-3 .3-1.2-2.8L2.9 15.7l.7-2.9-.7-2.9 2.6-1.5L6.7 4z"/><polyline points="8.5 12 11 14.5 15.5 9.5"/>',
  'listing-active':
    '<circle cx="12" cy="12" r="9" opacity="0.3"/><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
  'listing-draft':
    '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
  'listing-sold':
    '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.41.59l6.5 6.5a2 2 0 0 1 0 2.83l-7.5 7.5a2 2 0 0 1-2.83 0l-6.5-6.5A2 2 0 0 1 3 12.5z"/><polyline points="8 11.5 10.5 14 15.5 9"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/>',
  'listing-expired':
    '<circle cx="12" cy="12" r="9"/><polyline points="12 7.5 12 12 15 14"/><line x1="8.5" y1="3.5" x2="11" y2="6"/><line x1="11" y1="3.5" x2="8.5" y2="6"/>',

  // ─── ACTION / UI ─────────────────────────────────────────────────────────
  search:
    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  filter:
    '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/>',
  sort:
    '<polyline points="8 7 11 4 14 7"/><line x1="11" y1="4" x2="11" y2="20"/><polyline points="10 17 13 20 16 17"/><line x1="13" y1="20" x2="13" y2="4"/>',
  edit:
    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  delete:
    '<polyline points="4 7 20 7"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  copy:
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  'external-link':
    '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><line x1="20" y1="4" x2="11" y2="13"/><polyline points="14 4 20 4 20 10"/>',
  download:
    '<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M4 20h16"/>',
  upload:
    '<path d="M12 21V9"/><polyline points="7 13 12 8 17 13"/><path d="M4 4h16"/>',
  refresh:
    '<polyline points="21 4 21 10 15 10"/><path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><polyline points="3 20 3 14 9 14"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/>',
  close:
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  back:
    '<polyline points="15 6 9 12 15 18"/>',
  forward:
    '<polyline points="9 6 15 12 9 18"/>',
  expand:
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  collapse:
    '<polyline points="4 10 10 10 10 4"/><polyline points="20 14 14 14 14 20"/><line x1="10" y1="10" x2="3" y2="3"/><line x1="14" y1="14" x2="21" y2="21"/>',
  menu:
    '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'more-horizontal':
    '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  'more-vertical':
    '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  check:
    '<polyline points="20 6 9 17 4 12"/>',
  'check-circle':
    '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/>',
  warning:
    '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  error:
    '<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  info:
    '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  bell:
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  'bell-dot':
    '<path d="M18.5 9.5a6 6 0 0 0-12 .5c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><circle cx="18" cy="5" r="3" fill="currentColor" stroke="none"/>',
  star:
    '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1-4.4-4.3 6.1-.9z"/>',
  'star-filled':
    '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  lock:
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><line x1="12" y1="15" x2="12" y2="17"/>',
  unlock:
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/><line x1="12" y1="15" x2="12" y2="17"/>',
  eye:
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 4.1"/><path d="M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/>',
  camera:
    '<path d="M4 7h3l1.8-2.4a1 1 0 0 1 .8-.4h4.8a1 1 0 0 1 .8.4L19 7h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  photo:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.8"/><polyline points="4 18 9 12 12.5 15.5 16 11 20 17"/>',
  video:
    '<rect x="2.5" y="6" width="13" height="12" rx="2"/><polygon points="15.5 10 21.5 6.5 21.5 17.5 15.5 14"/>',
  attach:
    '<path d="M20 11.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  tag:
    '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.41.59l6.5 6.5a2 2 0 0 1 0 2.83l-7.5 7.5a2 2 0 0 1-2.83 0l-6.5-6.5A2 2 0 0 1 3 12.5z"/><circle cx="8" cy="8" r="1.5"/>',
  calendar:
    '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  plus:
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus:
    '<line x1="5" y1="12" x2="19" y2="12"/>',
  'chevron-down':
    '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up':
    '<polyline points="6 15 12 9 18 15"/>',
  drag:
    '<circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="6" r="1.6" fill="currentColor"/><circle cx="9" cy="12" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="9" cy="18" r="1.6" fill="currentColor"/><circle cx="15" cy="18" r="1.6" fill="currentColor"/>',

  // ─── AVIATION ────────────────────────────────────────────────────────────
  'aircraft-ga':
    '<path d="M2 14l7-1.2 2-6.3a1 1 0 0 1 2 0l1.2 5.9 7.8 1.6v1.6l-7-1-1 4 2.5 1.6v1.3L12 17.6 5 19.2v-1.3L8 16l-1-3.6-5 .9z"/>',
  'aircraft-twin':
    '<path d="M2 14l6.5-1 2-6a1 1 0 0 1 2 0l1.2 5.6 7.8 1.6v1.5l-6.5-.9-1 3.5 2.3 1.5v1.2L12 17l-6 1.6v-1.2L8.2 16l-.9-3.2-5.3.8z"/><circle cx="6.5" cy="13" r="1.8"/><circle cx="15.5" cy="13.6" r="1.8"/>',
  'aircraft-helo':
    '<line x1="3" y1="5" x2="21" y2="5"/><line x1="12" y1="5" x2="12" y2="9"/><path d="M5 11h11a3 3 0 0 1 3 3v1l3 1v1.5l-3-.4a3 3 0 0 1-3 2.4H8a3 3 0 0 1-3-3z"/><line x1="9" y1="20.5" x2="15" y2="20.5"/><line x1="12" y1="20" x2="12" y2="18"/>',
  logbook:
    '<rect x="4" y="3" width="15" height="18" rx="1.5"/><line x1="8.5" y1="3" x2="8.5" y2="21"/><path d="M12 8.5l3-1.3 3 1.3-3 1.3z"/><line x1="11.5" y1="13" x2="16" y2="13"/><line x1="11.5" y1="16.5" x2="14.5" y2="16.5"/>',
  'annual-inspection':
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 3v1"/><polyline points="8.5 10 10 11.5 12.5 9"/><polyline points="8.5 15.5 10 17 12.5 14.5"/><line x1="14" y1="10.5" x2="16.5" y2="10.5"/><line x1="14" y1="16" x2="16.5" y2="16"/>',
  'ad-compliance':
    '<path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><path d="M8.6 14.5l1.8-5h.4l1.8 5"/><line x1="9.1" y1="13" x2="11.7" y2="13"/><path d="M13.6 14.5v-5h1.5a2.5 2.5 0 0 1 0 5z"/>',
  squawk:
    '<path d="M10.3 4.4L2.4 17.8a1.8 1.8 0 0 0 1.6 2.7h15.9a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a1.8 1.8 0 0 0-3.4 0z"/><path d="M13 10.8a2 2 0 0 0-2.6 2.5l-1.5 1.5 1.2 1.2 1.5-1.5a2 2 0 0 0 2.5-2.6l-1.2 1.2-1-.3-.3-1z"/>',
  hobbs:
    '<rect x="3" y="8" width="18" height="9" rx="1.5"/><rect x="6" y="11" width="2.6" height="3"/><rect x="9" y="11" width="2.6" height="3"/><rect x="12" y="11" width="2.6" height="3"/><rect x="15" y="11" width="2.6" height="3" fill="currentColor"/>',
  tach:
    '<path d="M4 17a9 9 0 1 1 16 0"/><line x1="5" y1="14" x2="6.5" y2="13.3"/><line x1="7.5" y1="9" x2="8.8" y2="10"/><line x1="12" y1="7" x2="12" y2="8.7"/><line x1="16.5" y1="9" x2="15.2" y2="10"/><line x1="19" y1="14" x2="17.5" y2="13.3"/><line x1="12" y1="17" x2="16" y2="11"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>',
  'tail-number':
    '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M7 14V10l3 4v-4"/><path d="M12.5 14v-4h2a1.3 1.3 0 0 1 0 2.6h-2"/><path d="M14 12.6l1.5 1.4"/><path d="M17 10v4"/>',
  '8130-form':
    '<path d="M7 3h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><polyline points="14 3 14 8 19 8"/><circle cx="11.5" cy="14.5" r="3.5"/><path d="M11.5 12.5l.5 1.4 1.5.1-1.2 1 .4 1.5-1.2-.8-1.2.8.4-1.5-1.2-1 1.5-.1z" fill="currentColor"/>',
  'trace-docs':
    '<path d="M8 3h6l4 4v8H8z"/><polyline points="14 3 14 7 18 7"/><path d="M5 7v11h9"/><polyline points="13.5 17.5 15.5 19.5 19.5 15"/>',
  shop:
    '<path d="M3 11l9-6 9 6"/><path d="M4 11v9h16v-9"/><path d="M4 14h16"/><path d="M9 20v-6h6v6"/>',
  mechanic:
    '<circle cx="12" cy="6" r="3"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/><path d="M15 13.5l3.2 3.2"/><path d="M17 11.5a2 2 0 0 1 2.7 2.7l-.9-.9-1.1.3-.3 1.1z"/>',
  owner:
    '<circle cx="10" cy="6" r="3"/><path d="M3.5 21v-2a6.5 6.5 0 0 1 11.5-4.1"/><circle cx="17.5" cy="14.5" r="2.5"/><path d="M19.3 16.3L22 19l-1.3 1.3"/><path d="M20.7 17.7l.6.6"/>',
  inspector:
    '<circle cx="10" cy="6" r="3"/><path d="M3.5 21v-2a6.5 6.5 0 0 1 9.5-5.8"/><rect x="13" y="12" width="9" height="10" rx="1.5"/><path d="M15.5 12v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/><polyline points="15 17 16.5 18.5 19 15.5"/>',

  // ─── BRAND / SOCIAL ──────────────────────────────────────────────────────
  'brand-logo-mark':
    '<path d="M3 16.5l9-12a1 1 0 0 1 1.7.3l1.8 5.2 5.2 1.8a1 1 0 0 1 .3 1.7l-12 9 1.8-6.3z"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  'social-facebook':
    '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V22H14v-7.5h2.5l.6-3.5H14V9a.5.5 0 0 1 .5-.5z" fill="currentColor" stroke="none"/>',
  'social-twitter-x':
    '<path d="M4 4h3.8l4 5.6L16.5 4H20l-6.3 7.4L20.5 20h-3.8l-4.4-6.1L7 20H3.5l6.7-7.8z" fill="currentColor" stroke="none"/>',
  'social-linkedin':
    '<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6.5" y="10" width="2.6" height="7.5" fill="currentColor" stroke="none"/><circle cx="7.8" cy="7" r="1.5" fill="currentColor" stroke="none"/><path d="M11.5 17.5V10h2.6v1a3 3 0 0 1 2.6-1.3c2 0 3.3 1.3 3.3 4v3.8h-2.6V14c0-1.1-.4-1.9-1.5-1.9s-1.8.8-1.8 1.9v3.5z" fill="currentColor" stroke="none"/>',
  'social-instagram':
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none"/>',
  'social-youtube':
    '<rect x="2.5" y="6" width="19" height="12" rx="3.5"/><polygon points="10 9.2 16 12 10 14.8" fill="currentColor" stroke="none"/>',
} as const

/**
 * Precise union of every registered icon name — drives autocomplete and
 * compile-time validation on the <Icon name=...> prop.
 */
export type IconName = keyof typeof iconRegistry

/**
 * The brand wordmark renders wider than the standard 24x24 grid, so it
 * carries its own viewBox. <Icon> consults this map and falls back to
 * '0 0 24 24' for everything else.
 */
export const iconViewBox: Partial<Record<IconName, string>> = {
  // 'brand-logo-full' lives here — see fullMarkRegistry below.
}

/**
 * Wide-format icons that need a non-standard viewBox. The brand wordmark
 * (mark + "myaircraft" lettering) is authored at 132x24.
 */
export const wideIconRegistry = {
  'brand-logo-full':
    '<path d="M3 16.5l9-12a1 1 0 0 1 1.7.3l1.8 5.2 5.2 1.8a1 1 0 0 1 .3 1.7l-12 9 1.8-6.3z"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><text x="30" y="16.5" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13" font-weight="600" letter-spacing="-0.3" fill="currentColor" stroke="none">myaircraft</text>',
} as const

/**
 * Union of wide-format (non-24x24) icon names.
 */
export type WideIconName = keyof typeof wideIconRegistry

/** viewBox for each wide-format icon. */
export const wideIconViewBox: Record<WideIconName, string> = {
  'brand-logo-full': '0 0 132 24',
}

/** Combined name union covering both the standard and wide registries. */
export type AnyIconName = IconName | WideIconName
