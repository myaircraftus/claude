'use client'

export type SimulatorRole =
  | 'mechanic'
  | 'ia'
  | 'owner'
  | 'pilot'
  | 'faaInspector'
  | 'buyer'
  | 'dealer'
  | 'fleetAdmin'

export interface SourceCard {
  label: string
  docType: string
  page: string
  snippet: string
}

export interface RoleScenario {
  id: string
  title: string
  prompt: string
  answerTitle: string
  answerBody: string
  confidence: 'high' | 'medium'
  sourceCards: SourceCard[]
  quickActions: string[]
  nextQuestions?: string[]
}

export interface RoleDefinition {
  id: SimulatorRole
  label: string
  shortLabel: string
  icon: string // lucide icon name
  description: string
  color: string // tailwind color class for accent
  scenarios: RoleScenario[]
}

// ─── MECHANIC ───────────────────────────────────────────────────────────────

const mechanicScenarios: RoleScenario[] = [
  {
    id: 'mechanic-1',
    title: 'Last 100-Hour Inspection',
    prompt: 'When was the last 100-hour inspection completed on N8202L and what was the Hobbs time?',
    answerTitle: 'Last 100-Hour: March 14, 2024 — 4,217.3 Hobbs',
    answerBody:
      'The most recent 100-hour inspection on N8202L (Cessna 172S) was completed on March 14, 2024, at 4,217.3 Hobbs hours and 3,892.1 tach hours. The inspection was performed by A&P Mark Hendricks (cert. 3427891) at Skyline Aviation, Prescott, AZ. No discrepancies were deferred. The next 100-hour is due at 4,317.3 Hobbs.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airframe Logbook · Page 47',
        docType: 'Logbook',
        page: 'Page 47',
        snippet: '100-hr inspection completed 3/14/2024 at Hobbs 4217.3. Cert. 3427891.',
      },
      {
        label: 'Work Order · 2024-03-14',
        docType: 'Work Order',
        page: 'WO-2024-0314',
        snippet: 'All items inspected per 14 CFR 91.409. No items deferred. Return to service.',
      },
    ],
    quickActions: ['View full inspection checklist', 'Draft next 100-hr reminder', 'See all discrepancies'],
    nextQuestions: [
      'Were any ADs found applicable during that inspection?',
      'What oil was used at the last 100-hour?',
      'Show me the compression check results',
    ],
  },
  {
    id: 'mechanic-2',
    title: 'Magneto Timing Spec',
    prompt: 'What is the magneto timing specification for the Lycoming IO-360-L2A in N8202L?',
    answerTitle: 'Magneto Timing: 25° BTC both mags (IO-360-L2A)',
    answerBody:
      'Per the Lycoming IO-360-L2A Overhaul Manual (SSP-1776-1) and the Cessna 172S POH Section 8, ignition timing is set at 25° BTC for both left and right magnetos. Timing was last checked and confirmed on March 14, 2024, during the 100-hour inspection. The spark plug gap specification is 0.018–0.022 in. Champion REM37BY plugs are currently installed.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'POH Section 8 · Page 8-7',
        docType: 'POH',
        page: 'Section 8, Page 8-7',
        snippet: 'Ignition timing: 25° BTC. Both magnetos. Champion REM37BY plugs.',
      },
      {
        label: 'Lycoming Overhaul Manual · Page 3-18',
        docType: 'Overhaul Manual',
        page: 'Page 3-18',
        snippet: 'IO-360-L2A timing spec: 25° BTC ± 1°. Do not exceed 26° advance.',
      },
      {
        label: 'Work Order · 2024-03-14',
        docType: 'Work Order',
        page: 'WO-2024-0314',
        snippet: 'Magneto timing verified at 25° BTC L&R. No adjustment required.',
      },
    ],
    quickActions: ['View magneto service history', 'Find applicable magneto ADs', 'Log timing check entry'],
    nextQuestions: [
      'When were the spark plugs last replaced?',
      'Is there an AD on the Slick magnetos?',
      'What is the magneto drop limit at runup?',
    ],
  },
  {
    id: 'mechanic-3',
    title: 'Oil Leak History',
    prompt: "Show me all oil leak squawks and repairs on N8202L's engine over the past 3 years",
    answerTitle: '3 Oil Leak Events Found (2021–2024)',
    answerBody:
      'Three oil leak events are documented in the engine logbook and work orders over the past three years. (1) Nov 2021 — Rear main seal seep, replaced with Lycoming PN LW-13287. (2) June 2022 — Oil filler cap O-ring failed, replaced with AN6227-14. (3) August 2023 — Left valve cover gasket weeping, replaced both covers with new Felpro gaskets per SB-388B. No recurring location. All repairs signed off and return-to-service authorized.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Engine Logbook · Page 23',
        docType: 'Engine Logbook',
        page: 'Page 23',
        snippet: 'Rear main seal replaced 11/4/2021. Lycoming PN LW-13287. Hrs: 3,441.0.',
      },
      {
        label: 'Work Order · 2022-06-08',
        docType: 'Work Order',
        page: 'WO-2022-0608',
        snippet: 'Oil filler cap O-ring replaced AN6227-14. Leak test — no seep.',
      },
      {
        label: 'Engine Logbook · Page 31',
        docType: 'Engine Logbook',
        page: 'Page 31',
        snippet: 'L/R valve cover gaskets replaced per SB-388B. 8/17/2023 Hrs: 4,088.5.',
      },
    ],
    quickActions: ['Export leak history PDF', 'Check current oil consumption rate', 'Draft inspection note'],
    nextQuestions: [
      'Has the oil consumption been trending up?',
      'When is the next oil change due?',
      'Are there any open oil-related squawks?',
    ],
  },
  {
    id: 'mechanic-4',
    title: 'Part Number Lookup',
    prompt: 'What is the part number for the left main landing gear strut seal on a Cessna 172S?',
    answerTitle: 'LH Main Gear Strut Seal: Cessna PN 0441190-1',
    answerBody:
      "The left main landing gear strut inner seal for the Cessna 172S (all serial numbers) is Cessna PN 0441190-1. The outer wiper seal is PN 0441191-1. These are documented in the Cessna 172S Illustrated Parts Catalog (IPC), Chapter 32, Figure 32-10, Items 5 and 6. Current inventory in N8202L's records shows the strut was serviced and seals replaced on January 9, 2023, at 4,015.2 Hobbs.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'IPC Chapter 32 · Fig 32-10',
        docType: 'Parts Catalog',
        page: 'Chapter 32, Fig 32-10',
        snippet: 'Item 5: Seal, inner — PN 0441190-1. Item 6: Wiper, outer — PN 0441191-1.',
      },
      {
        label: 'Work Order · 2023-01-09',
        docType: 'Work Order',
        page: 'WO-2023-0109',
        snippet: 'LH main gear strut seals replaced. 0441190-1 and 0441191-1 installed. Air serviced.',
      },
    ],
    quickActions: ['Order parts', 'View full gear service history', 'Find related SBs'],
    nextQuestions: [
      'When is the next gear rigging inspection due?',
      'What is the strut inflation specification?',
      'Has the nose gear ever been repaired?',
    ],
  },
]

// ─── IA INSPECTOR ────────────────────────────────────────────────────────────

const iaScenarios: RoleScenario[] = [
  {
    id: 'ia-1',
    title: 'AD Compliance Review',
    prompt: 'Show me all applicable ADs for N8202L and confirm current compliance status',
    answerTitle: '14 Applicable ADs — All Compliant as of Last Annual',
    answerBody:
      'N8202L (Cessna 172S, S/N 172S8202) has 14 applicable Airworthiness Directives on record. All 14 are documented as compliant in the current AD log as of the April 2024 annual inspection. Notable recurring ADs: AD 2012-15-05 (ELT battery, complied 02/2024), AD 2004-10-13 (elevator trim tab, inspected 04/2024), AD 2020-26-06 (altimeter static system, complied 10/2023). Next compliance action due: AD 2012-15-05 battery replacement — February 2027.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'AD Compliance Log · Page 1–4',
        docType: 'AD Log',
        page: 'Pages 1–4',
        snippet: '14 applicable ADs listed. Last reviewed 4/3/2024 annual inspection. All compliant.',
      },
      {
        label: 'Airframe Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'Annual inspection 4/3/2024. AD review performed. See AD log attached.',
      },
    ],
    quickActions: ['Export AD compliance report', 'Flag upcoming due dates', 'Cross-check FAA AD database'],
    nextQuestions: [
      'Show me the ELT battery replacement documentation',
      'Are there any open ADs with no compliance date?',
      'Print AD compliance summary for sign-off',
    ],
  },
  {
    id: 'ia-2',
    title: 'Annual Inspection Sign-Off',
    prompt: 'What documentation do I need to review before signing off the annual on N8202L?',
    answerTitle: 'Annual Sign-Off Checklist — 7 Required Documents',
    answerBody:
      'For N8202L annual inspection sign-off under 14 CFR 91.409 and 14 CFR 43 Appendix D, the following must be reviewed: (1) Airworthiness Certificate and Registration — confirmed on file. (2) POH/AFM with all revisions — Rev. 12 on file. (3) Weight & Balance current — last updated Jan 2022 after GPS install. (4) AD compliance log — all 14 ADs current. (5) Engine/propeller logbooks with all entries since last annual. (6) Form 337s for any major repairs/alterations — 3 on file. (7) Equipment list — current. All documents present in system.',
    confidence: 'high',
    sourceCards: [
      {
        label: '14 CFR 43 App D · para (a)',
        docType: 'Regulation Reference',
        page: 'Appendix D',
        snippet: 'Annual inspection scope: all items listed in paragraphs (a)(1) through (a)(16).',
      },
      {
        label: 'Form 337 · 3 on file',
        docType: 'Form 337',
        page: 'Page 1',
        snippet: 'Major alteration — Garmin GNX 375 install. Approved 01/14/2022.',
      },
    ],
    quickActions: ['Generate inspection checklist PDF', 'Review all 337s', 'Check weight & balance currency'],
    nextQuestions: [
      'Who performed the last annual and are they still current as IA?',
      'Are there any deferred maintenance items?',
      'Show me the weight and balance data',
    ],
  },
  {
    id: 'ia-3',
    title: '337 Major Alteration Review',
    prompt: 'List all Form 337 major alterations on record for N8202L',
    answerTitle: '3 Form 337s on File — All FAA Accepted',
    answerBody:
      'N8202L has three Form 337 major alterations on record: (1) January 2022 — Garmin GNX 375 installation in lieu of KLN 94, approved per STC SA02547SE. (2) August 2019 — Removal of factory vacuum system, installation of mid-continent MD302 SAI per STC SA01846SE. (3) March 2016 — Wheel pant removal and fairings re-installed per approved data. All three 337s are FAA accepted (stamped copies on file). Equipment list updated to reflect each alteration.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Form 337 · Jan 2022',
        docType: 'Form 337',
        page: 'Page 1–2',
        snippet: 'GNX 375 installed per STC SA02547SE. FAA accepted 01/14/2022. FSDO: PHX-FSDO.',
      },
      {
        label: 'Form 337 · Aug 2019',
        docType: 'Form 337',
        page: 'Page 1',
        snippet: 'Vacuum system removed. MD302 SAI installed per STC SA01846SE. Accepted 8/27/2019.',
      },
    ],
    quickActions: ['Export all 337s as PDF', 'Verify STC data sheets on file', 'Update equipment list'],
    nextQuestions: [
      'Is the STC data sheet for the GNX 375 on file?',
      'Does the W&B reflect the avionics swap?',
      'Are there any 337s missing FAA acceptance stamp?',
    ],
  },
  {
    id: 'ia-4',
    title: 'Return to Service Entry',
    prompt:
      'Draft a logbook return-to-service entry for the completed annual inspection on N8202L dated April 3, 2024',
    answerTitle: 'RTS Entry Draft — Ready for Review',
    answerBody:
      'Suggested return-to-service logbook entry: "I certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition. Date: April 3, 2024. Airframe TTAF: 4,217.3 hours. AD compliance verified — see attached AD log. No items deferred. Signature: [IA Name], IA Certificate No. [XXXXXXX], Expiration: [date]." Per 14 CFR 43.11, the entry must include the type of inspection, date, aircraft TTAF, and a statement on airworthiness. Deferred items must be listed separately.',
    confidence: 'high',
    sourceCards: [
      {
        label: '14 CFR 43.11 · para (a)',
        docType: 'Regulation Reference',
        page: '§43.11(a)',
        snippet: 'Each person who maintains... shall make an entry in the maintenance record... the type of inspection and a brief description.',
      },
      {
        label: 'Airframe Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'TTAF 4217.3 hrs as of 4/3/2024 annual inspection.',
      },
    ],
    quickActions: ['Copy entry text', 'Add to logbook', 'Print for signature'],
    nextQuestions: [
      'What deferred items need to be listed?',
      'Does the owner need a separate maintenance release?',
      'Generate the AD compliance attachment',
    ],
  },
]

// ─── OWNER ───────────────────────────────────────────────────────────────────

const ownerScenarios: RoleScenario[] = [
  {
    id: 'owner-1',
    title: 'Last Annual Date',
    prompt: 'When is my next annual due and when was the last one completed?',
    answerTitle: 'Annual Due: April 30, 2025 — Last Completed April 3, 2024',
    answerBody:
      "Your last annual inspection was completed on April 3, 2024, by IA James Vickers (IA cert. 4812093) at Desert Sky Avionics & Maintenance in Prescott, AZ. Your next annual is due by April 30, 2025 (end of the month following the annual month, per 14 CFR 91.409). The aircraft was returned to service with no deferred items and all ADs compliant. Current TTAF at that annual was 4,217.3 hours.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airframe Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'Annual inspection 4/3/2024. IA: J. Vickers 4812093. TTAF 4,217.3. No deferred items.',
      },
    ],
    quickActions: ['Set annual reminder', 'Find IA inspectors nearby', 'View full inspection history'],
    nextQuestions: [
      'What was the cost of the last annual?',
      'Were any squawks found at the last annual?',
      'Who is my preferred IA mechanic?',
    ],
  },
  {
    id: 'owner-2',
    title: 'Engine Overhaul Status',
    prompt: 'How many hours until my engine is due for overhaul on N8202L?',
    answerTitle: '782 Hours Remaining to TBO (Lycoming IO-360-L2A)',
    answerBody:
      "The Lycoming IO-360-L2A in N8202L has a manufacturer recommended TBO of 2,000 hours or 12 years, whichever comes first. Current engine time since new (SMOH): 1,218.0 hours as of the last logbook entry (March 2024). Time remaining to TBO: approximately 782 hours. The engine was zero-timed and replaced new from factory in December 2012. Calendar time since new: 11.3 years — approaching the 12-year calendar TBO as well. Consider planning for overhaul or replacement in 2025.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Engine Logbook · Page 1',
        docType: 'Engine Logbook',
        page: 'Page 1',
        snippet: 'New engine installed 12/18/2012. SMOH: 0.0 hrs. Lycoming S/N L-14822-36A.',
      },
      {
        label: 'Engine Logbook · Page 35',
        docType: 'Engine Logbook',
        page: 'Page 35',
        snippet: 'Engine SMOH: 1,218.0 hrs as of 3/14/2024 100-hr inspection.',
      },
    ],
    quickActions: ['Get overhaul cost estimates', 'Compare overhaul vs exchange', 'Set TBO reminder alert'],
    nextQuestions: [
      'What shops do overhauls for the IO-360?',
      'What will an exchange engine cost?',
      'What does my oil analysis history show?',
    ],
  },
  {
    id: 'owner-3',
    title: 'Propeller Work History',
    prompt: 'Has the propeller on N8202L ever been repaired or overhauled?',
    answerTitle: 'Prop Overhauled Once — February 2018 at 3,101.0 TTAF',
    answerBody:
      "The McCauley 1C172/DTM7553 two-blade fixed-pitch propeller on N8202L was overhauled by Southwest Prop Shop in Tucson, AZ on February 22, 2018, at airframe TTAF of 3,101.0 hours. The overhaul was performed to McCauley Service Manual M-670001 standards. Propeller logs show no prop strikes since overhaul. Current time since overhaul (SPOH): approximately 1,116.3 hours. McCauley recommends 2,000-hour or 7-year overhaul interval. Next overhaul due: February 2025 (calendar limit approaching).",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Propeller Logbook · Page 8',
        docType: 'Prop Logbook',
        page: 'Page 8',
        snippet: 'OH by Southwest Prop Shop 2/22/2018. SPOH: 0.0. McCauley M-670001. TTAF: 3,101.0.',
      },
      {
        label: 'Work Order · 2018-02-22',
        docType: 'Work Order',
        page: 'WO-2018-0222',
        snippet: 'Prop overhauled, rebalanced, painted. Return to service cert. issued.',
      },
    ],
    quickActions: ['Schedule prop overhaul', 'Find prop shops nearby', 'Check for prop ADs'],
    nextQuestions: [
      'Has there ever been a prop strike event?',
      'What is the prop AD compliance status?',
      'What will a prop overhaul cost?',
    ],
  },
  {
    id: 'owner-4',
    title: 'Major Maintenance Summary',
    prompt: 'Give me a summary of all major maintenance work done on N8202L in the last 5 years',
    answerTitle: '12 Major Maintenance Events (2019–2024)',
    answerBody:
      "Over the past 5 years, N8202L has had 12 significant maintenance events: Annual inspections (2019–2024) — 5 annuals, all completed without deferred items except 2021 (brake pads deferred, completed within 30 days). Avionics: GNX 375 installed Jan 2022 (Form 337). Safety: MD302 SAI backup installed Aug 2019 (Form 337). Engine: Valve cover gaskets replaced Aug 2023; cylinder compression check Feb 2024 — all within limits. Airframe: LH main gear strut seal Jan 2023; nose strut O-ring Sept 2022. Other: Transponder cert. Oct 2023; static/altimeter check Oct 2023.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airframe Logbook · Pages 38–49',
        docType: 'Logbook',
        page: 'Pages 38–49',
        snippet: '5 annual inspections documented 2019–2024. Major alterations per 337s on file.',
      },
      {
        label: 'Form 337 · Jan 2022',
        docType: 'Form 337',
        page: 'Page 1',
        snippet: 'Garmin GNX 375 major alteration. FAA accepted 1/14/2022.',
      },
    ],
    quickActions: ['Export 5-year maintenance PDF', 'Calculate total maintenance cost', 'Share with buyer'],
    nextQuestions: [
      'What was the total maintenance spend?',
      'Were there any insurance claims filed?',
      'Is there a damage history?',
    ],
  },
]

// ─── PILOT ───────────────────────────────────────────────────────────────────

const pilotScenarios: RoleScenario[] = [
  {
    id: 'pilot-1',
    title: 'Fuel Capacity & Usable Fuel',
    prompt: 'What is the total and usable fuel capacity for N8202L?',
    answerTitle: 'Total: 56 gal — Usable: 53 gal (Cessna 172S)',
    answerBody:
      'The Cessna 172S N8202L has a total fuel capacity of 56.0 U.S. gallons (28.0 gal per wing tank) and 53.0 U.S. gallons usable (26.5 per tank). 3.0 gallons are unusable and must not be counted in fuel planning. Approved fuels: 100LL aviation gasoline only (blue). Do not use automobile gasoline without an approved STC. Fuel consumption at 75% power: approximately 8.4 GPH. At 55% power cruise: approximately 6.1 GPH.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'POH Section 6 · Page 6-3',
        docType: 'POH',
        page: 'Section 6, Page 6-3',
        snippet: 'Fuel capacity: 56.0 gal total, 53.0 gal usable. 100LL only. Unusable: 3.0 gal.',
      },
      {
        label: 'POH Section 5 · Page 5-12',
        docType: 'POH',
        page: 'Section 5, Page 5-12',
        snippet: '75% power: 8.4 GPH. 55% power: 6.1 GPH. Range w/ 45-min reserve: 518 NM at 75%.',
      },
    ],
    quickActions: ['Calculate range with current fuel', 'View fuel burn charts', 'Log fuel purchase'],
    nextQuestions: [
      'What is the maximum range at best fuel economy?',
      'Can I use Mogas in this aircraft?',
      'What are the fuel venting requirements?',
    ],
  },
  {
    id: 'pilot-2',
    title: 'Crosswind Limit',
    prompt: "What is the demonstrated crosswind component for N8202L's POH?",
    answerTitle: 'Demonstrated Crosswind: 15 knots (not a limitation)',
    answerBody:
      "The Cessna 172S POH states a demonstrated crosswind component of 15 knots. Per FAA guidance, this is a demonstrated value, not a regulatory limitation — the aircraft may be operated in crosswinds exceeding 15 knots at pilot discretion. However, N8202L's insurance policy (on file) limits operations to demonstrated crosswind values. The maximum demonstrated crosswind applies to both takeoff and landing. Consult Section 4 (Normal Procedures) for crosswind landing technique.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'POH Section 2 · Page 2-4',
        docType: 'POH',
        page: 'Section 2, Page 2-4',
        snippet: 'Maximum demonstrated crosswind component: 15 knots. (Not a limitation.)',
      },
      {
        label: 'POH Section 4 · Page 4-10',
        docType: 'POH',
        page: 'Section 4, Page 4-10',
        snippet: 'Crosswind landing technique: establish crab, transition to slip on short final...',
      },
    ],
    quickActions: ['View crosswind chart', 'Calculate crosswind component', 'Review normal procedures'],
    nextQuestions: [
      'What is the maximum flap setting for crosswind landings?',
      'What is the stall speed in landing configuration?',
      'Are there any pilot operating notes from the owner?',
    ],
  },
  {
    id: 'pilot-3',
    title: 'Required Inspections Status',
    prompt: 'What inspections are currently due or coming up on N8202L?',
    answerTitle: '2 Items Due Within 60 Days',
    answerBody:
      'Current inspection status for N8202L: (1) Annual Inspection — DUE April 30, 2025 (28 days away). (2) ELT Battery — DUE February 2027, not imminent. (3) Transponder Certification — Last done October 2023, next due October 2025 (6 months away). (4) Static/Altimeter check — Last done October 2023, next due October 2025. (5) 100-Hour — Due at 4,317.3 Hobbs. Current Hobbs: 4,289.1 (28.2 hours remaining). Two items require action within 60 days: annual inspection and 100-hour inspection.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Inspection Tracking · Current',
        docType: 'Inspection Log',
        page: 'Dashboard',
        snippet: 'Annual due: 4/30/2025. 100-hr due at 4,317.3 Hobbs (current: 4,289.1).',
      },
      {
        label: 'Airframe Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'Annual completed 4/3/2024. 100-hr completed 3/14/2024 at Hobbs 4,217.3.',
      },
    ],
    quickActions: ['Set inspection reminders', 'Contact preferred mechanic', 'View all upcoming items'],
    nextQuestions: [
      'Who should I call to schedule the annual?',
      'What is included in the 100-hour inspection?',
      'Is the aircraft currently airworthy?',
    ],
  },
  {
    id: 'pilot-4',
    title: 'Recent Squawks',
    prompt: 'Are there any open squawks or known issues I should be aware of before flying N8202L?',
    answerTitle: 'No Open Squawks — Last Flight Discrepancy Closed Jan 2024',
    answerBody:
      "N8202L has no open squawks or deferred maintenance items as of the last annual inspection (April 3, 2024). The most recent squawk was logged January 18, 2024: slight right rudder pedal stiffness noted by pilot. Investigated and resolved Jan 20, 2024 — rudder cable tension adjusted and fairleads lubricated. No further complaints. The aircraft was returned to service with no restrictions. All systems operational per the March 2024 100-hour inspection.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Squawk Log · Jan 2024',
        docType: 'Squawk Log',
        page: 'Entry 2024-01-18',
        snippet: 'Pilot noted: right rudder pedal slightly stiff. Resolved 1/20/2024. Cable tension adj.',
      },
      {
        label: 'Airframe Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'Annual 4/3/2024 — no deferred items. Aircraft returned to service.',
      },
    ],
    quickActions: ['Log new squawk', 'Review squawk history', 'Contact mechanic'],
    nextQuestions: [
      'What was the rudder cable tension spec?',
      'Who fixed the rudder issue?',
      'Are there any pilot notes in the aircraft?',
    ],
  },
]

// ─── FAA INSPECTOR ───────────────────────────────────────────────────────────

const faaInspectorScenarios: RoleScenario[] = [
  {
    id: 'faa-1',
    title: 'Airworthiness Certificate Evidence',
    prompt: 'Confirm the airworthiness certificate and registration are current for N8202L',
    answerTitle: 'Airworthiness: Standard (Normal) — Registration Current through Oct 2026',
    answerBody:
      'N8202L holds a Standard Airworthiness Certificate (Normal category) issued by FAA FSDO-19 Phoenix, dated July 12, 2007, when the aircraft was manufactured. Standard airworthiness certificates do not expire. The aircraft registration (FAA Registry N8202L) was last renewed and is current through October 31, 2026. Aircraft is a 2007 Cessna 172S, S/N 172S8202. Registered owner: Desert Sky Flying Club LLC, 1400 Commerce Dr., Prescott, AZ 86301.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airworthiness Certificate · Original',
        docType: 'FAA Certificate',
        page: 'Form 8100-2',
        snippet: 'Standard airworthiness, Normal cat. Issued 7/12/2007. FSDO-19. Does not expire.',
      },
      {
        label: 'Aircraft Registration · Form 8050-3',
        docType: 'FAA Registration',
        page: 'Form 8050-3',
        snippet: 'N8202L. Cessna 172S. S/N 172S8202. Owner: Desert Sky Flying Club LLC. Exp: 10/31/2026.',
      },
    ],
    quickActions: ['Verify FAA registry', 'Check registration chain of title', 'View historical owners'],
    nextQuestions: [
      'Has the aircraft ever had a special airworthiness certificate?',
      'Is there a lien on the aircraft?',
      'What is the registered address of the owner?',
    ],
  },
  {
    id: 'faa-2',
    title: 'Repair & Alteration History',
    prompt: "Review all documented repairs and major alterations in N8202L's maintenance records",
    answerTitle: '3 Major Alterations, 0 Major Repairs Documented',
    answerBody:
      'Review of N8202L maintenance records identifies three (3) major alterations and zero (0) major repairs as defined under 14 CFR 43 Appendix A. Major alterations: (1) GNX 375 avionics installation, STC SA02547SE, Form 337 accepted PHX-FSDO 1/14/2022. (2) MD302 SAI backup instrument, STC SA01846SE, Form 337 accepted 8/27/2019. (3) Wheel pant removal/reinstall per approved data, Form 337 accepted 3/15/2016. No structural repairs, control surface repairs, or engine major repairs are documented. All 337s have FAA acceptance stamps on file.',
    confidence: 'high',
    sourceCards: [
      {
        label: 'Form 337 Log · 3 entries',
        docType: 'Form 337',
        page: 'All Pages',
        snippet: '3 major alterations. All FAA accepted. No major repairs on record.',
      },
      {
        label: 'Airframe Logbook · Pages 28–49',
        docType: 'Logbook',
        page: 'Pages 28–49',
        snippet: 'Maintenance entries 2016–2024. No structural repair entries noted.',
      },
    ],
    quickActions: ['View all Form 337s', 'Verify STC approval basis', 'Export inspection report'],
    nextQuestions: [
      'Are the STC data sheets on file with the aircraft?',
      'Has this aircraft ever had an accident or incident?',
      'Are there any open SDRs for this aircraft?',
    ],
  },
  {
    id: 'faa-3',
    title: 'AD Compliance Verification',
    prompt: 'Verify AD compliance for AD 2012-15-05 (ELT battery) on N8202L',
    answerTitle: 'AD 2012-15-05 Complied — ELT Battery Replaced Feb 2024',
    answerBody:
      "AD 2012-15-05 requires replacement of the Emergency Locator Transmitter battery at intervals not to exceed 50% battery capacity or every 2 years, whichever comes first. For N8202L's Artex 345 ELT (S/N A180924), the battery was last replaced February 8, 2024, at TTAF 4,199.1 hours by A&P Roger Banks (cert. 2291847). Battery installed: Duracell PN DR9VBAT, expiration date: February 2026. Next replacement due: February 2026. Logbook entry and battery box label photographed and on file.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airframe Logbook · Page 48',
        docType: 'Logbook',
        page: 'Page 48',
        snippet: 'AD 2012-15-05 complied. ELT battery replaced 2/8/2024. Artex 345 S/N A180924.',
      },
      {
        label: 'AD 2012-15-05 · FAA Text',
        docType: 'Airworthiness Directive',
        page: 'Compliance Section',
        snippet: 'Replace ELT battery per manufacturer instructions. Interval: 2 years or 50% capacity.',
      },
    ],
    quickActions: ['Print AD compliance record', 'View ELT installation docs', 'Check next due date'],
    nextQuestions: [
      'What is the ELT registration status with NOAA?',
      'Are there other ELT-related ADs applicable?',
      'When is the next ELT operational check due?',
    ],
  },
  {
    id: 'faa-4',
    title: 'Inspection Record Continuity',
    prompt: 'Are there any gaps in the inspection record continuity for N8202L?',
    answerTitle: 'No Record Gaps Found — Continuous History Since 2007',
    answerBody:
      "N8202L's maintenance records show continuous documentation from the aircraft's manufacture in 2007 to the present. Annual inspection entries are present for all years: 2007–2024 (17 annuals). The airframe logbook contains 49 used pages with consecutive entries and no apparent missing pages. Engine logbook (installed Dec 2012): 35 pages, no gaps. Propeller logbook: 10 pages, no gaps. All logbooks are original bound volumes. No white-out, alterations, or unexplained gaps were identified during document review.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Airframe Logbook · Pages 1–49',
        docType: 'Logbook',
        page: 'Full Volume',
        snippet: '17 annual inspections documented consecutively 2007–2024. No apparent gaps.',
      },
      {
        label: 'Engine Logbook · Pages 1–35',
        docType: 'Engine Logbook',
        page: 'Full Volume',
        snippet: 'Engine installed 12/2012. Continuous entries through 3/2024. No gaps noted.',
      },
    ],
    quickActions: ['Export records summary', 'Flag any anomalies', 'Generate inspection timeline'],
    nextQuestions: [
      'Were the logbooks ever reported lost or replaced?',
      'Has the aircraft been outside the US?',
      'Is the aircraft subject to any open investigations?',
    ],
  },
]

// ─── BUYER / PREBUY ──────────────────────────────────────────────────────────

const buyerScenarios: RoleScenario[] = [
  {
    id: 'buyer-1',
    title: 'Damage History Check',
    prompt: 'Does N4409K (Piper PA-28) have any documented accident, incident, or major repair history?',
    answerTitle: 'One Incident — 2016 Gear-Up Landing, No Structural Damage',
    answerBody:
      "N4409K has one documented incident in its maintenance records: a gear-up (belly) landing at Peach State Airport (GA2) on September 3, 2016. The NTSB report (ERA16CA367) classified it as an accident. The aircraft sustained minor damage to the propeller, lower cowling, and belly skins. Repairs were performed by Peach State Aircraft Maintenance: propeller replaced, belly skins replaced per approved repair data, cowling replaced. All repairs documented with FAA Form 337 (no major structural repair classification). Engine teardown performed — no crankshaft damage found. The aircraft returned to service October 28, 2016.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'NTSB Report · ERA16CA367',
        docType: 'NTSB Report',
        page: 'Summary Page',
        snippet: 'Gear-up landing 9/3/2016. GA2. Minor damage: prop, cowl, belly skins. No injuries.',
      },
      {
        label: 'Airframe Logbook · Page 31',
        docType: 'Logbook',
        page: 'Page 31',
        snippet: 'Repair per approved data 10/28/2016. Belly skins replaced. Engine tear-down — serviceable.',
      },
      {
        label: 'Form 337 · Oct 2016',
        docType: 'Form 337',
        page: 'Page 1',
        snippet: 'Belly skin repair. Not classified as major structural repair. FAA accepted 10/2016.',
      },
    ],
    quickActions: ['View full NTSB report', 'Review all post-accident maintenance', 'Get engine teardown report'],
    nextQuestions: [
      'Was the crankshaft replaced or re-used after the prop strike?',
      'Has there been any recurring damage in the same area?',
      'What did the engine teardown find exactly?',
    ],
  },
  {
    id: 'buyer-2',
    title: 'Maintenance Quality Assessment',
    prompt: 'How would you rate the record quality and maintenance consistency on N4409K?',
    answerTitle: 'Record Quality: Good — Consistent Shop, Minor Gaps in 2014',
    answerBody:
      "N4409K's maintenance records reflect good overall quality. Positives: 28 of 29 annuals are documented with complete entries and A&P/IA signatures. The same maintenance facility (Blue Ridge Aviation, Macon, GA) performed 18 of 22 post-2003 annuals, indicating consistency. All Form 337s have FAA acceptance. Concerns: A 14-month gap exists in the logbook between March 2014 and May 2015 with no entries — the aircraft was reportedly stored during this period, but no pre-storage airworthiness record or return-to-service entry is documented. This should be verified with the seller.",
    confidence: 'medium',
    sourceCards: [
      {
        label: 'Airframe Logbook · Pages 18–22',
        docType: 'Logbook',
        page: 'Pages 18–22',
        snippet: 'Last entry 3/15/2014. Next entry 5/8/2015. No entries for 14 months.',
      },
      {
        label: 'Airframe Logbook · Pages 22–42',
        docType: 'Logbook',
        page: 'Pages 22–42',
        snippet: '18 annuals by Blue Ridge Aviation, Macon GA. Consistent entries 2003–2024.',
      },
    ],
    quickActions: ['Flag gap for follow-up', 'Request seller explanation', 'Generate prebuy report'],
    nextQuestions: [
      'Was the aircraft registered during the gap period?',
      'Who performed the 2015 return-to-service inspection?',
      'Are there any recurring discrepancies across annuals?',
    ],
  },
  {
    id: 'buyer-3',
    title: 'Engine Time & Status',
    prompt: 'What is the engine time and overhaul history on N4409K?',
    answerTitle: 'Engine: 612 SMOH — Top Overhaul 2019, Factory Reman 2018',
    answerBody:
      "N4409K is powered by a Lycoming O-360-A4M. The engine was factory remanufactured by Lycoming (zero-timed) in July 2018 at airframe TTAF of 4,211.0 hours. Current engine SMOH: 612.0 hours (Lycoming recommended TBO: 2,000 hours). In March 2019, a top overhaul was performed on cylinder #3 due to a cracked exhaust valve. The cylinder was replaced with a Lycoming factory cylinder (PN 75442). Compression check at last annual (March 2024): all four cylinders at 74/80 or better. Engine oil analysis (Blackstone Labs, Feb 2024): normal wear metals, no anomalies.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Engine Logbook · Page 1',
        docType: 'Engine Logbook',
        page: 'Page 1',
        snippet: 'Lycoming factory reman engine installed 7/15/2018. SMOH: 0.0. S/N L-29871-36A.',
      },
      {
        label: 'Engine Logbook · Page 7',
        docType: 'Engine Logbook',
        page: 'Page 7',
        snippet: '#3 cylinder replaced 3/22/2019. Cracked exhaust valve. Lycoming PN 75442.',
      },
      {
        label: 'Oil Analysis Report · Feb 2024',
        docType: 'Oil Analysis',
        page: 'Blackstone Report',
        snippet: 'Fe: 18, Cu: 4, Al: 3 ppm. All within normal limits. No anomalies. Recommend continue.',
      },
    ],
    quickActions: ['Download oil analysis history', 'Review compression records', 'Compare to similar aircraft'],
    nextQuestions: [
      'Were any other cylinders replaced at the top overhaul?',
      'Is there a warranty remaining on the factory reman engine?',
      'What oil has been used since the reman?',
    ],
  },
  {
    id: 'buyer-4',
    title: 'Prebuy Summary',
    prompt: 'Generate a prebuy due diligence summary for N4409K',
    answerTitle: 'Prebuy Summary: 3 Items for Further Investigation',
    answerBody:
      "N4409K Prebuy Summary — Piper PA-28-181 Archer III (2001): STRENGTHS: Factory remanufactured engine (612 SMOH), all ADs compliant, consistent maintenance shop history, good compression and recent oil analysis. Well-documented avionics: Garmin G5, GTN 650Xi, ADS-B compliant. CONCERNS: (1) 14-month logbook gap (2014–2015) — seller explanation needed. (2) 2016 gear-up landing and subsequent repairs — recommend prebuy mechanic verify belly skin integrity and confirm no hidden corrosion. (3) Propeller not yet overhauled at 612 hours — check McCauley calendar TBO. OVERALL: Aircraft appears well-maintained. Three items warrant follow-up before purchase.",
    confidence: 'medium',
    sourceCards: [
      {
        label: 'Airframe Logbook · Full Review',
        docType: 'Logbook',
        page: 'Pages 1–42',
        snippet: 'Complete review performed. 3 items flagged for due diligence.',
      },
      {
        label: 'NTSB Report · ERA16CA367',
        docType: 'NTSB Report',
        page: 'Summary',
        snippet: 'Gear-up landing 2016. Repairs completed. Verify belly integrity at prebuy.',
      },
    ],
    quickActions: ['Export prebuy report PDF', 'Share with IA inspector', 'Schedule prebuy inspection'],
    nextQuestions: [
      'What should my prebuy mechanic specifically inspect?',
      'What is fair market value for this aircraft?',
      'Can I get the logbooks shipped for independent review?',
    ],
  },
]

// ─── DEALER / BROKER ─────────────────────────────────────────────────────────

const dealerScenarios: RoleScenario[] = [
  {
    id: 'dealer-1',
    title: 'Buyer-Ready Summary',
    prompt: 'Create a buyer-ready maintenance summary for N2240E (Beechcraft Baron) to use in our listing',
    answerTitle: 'Buyer Summary: Baron N2240E — Complete Records, 680 SMOH',
    answerBody:
      "N2240E is a 1978 Beechcraft Baron 58 with complete logbooks from new. ENGINES: Both Continental IO-520-C engines overhauled by Zephyr Aircraft Engines in March 2020 — 680 SMOH each (Continental TBO: 1,700 hrs). AIRFRAME: TTAF 6,812.0 hours. Annual completed February 2024 with no deferred items. ADS-B compliant (Garmin GTX 345). AVIONICS: Garmin G500 glass panel (STC), GTN 750, GFC 500 autopilot. All STC documents on file. RECORDS: Complete original logbooks from new, all Form 337s, and AD compliance log on file. No damage history. Presentation-quality records.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Engine Logbooks (Both) · Page 1',
        docType: 'Engine Logbook',
        page: 'Page 1',
        snippet: 'Both engines OH by Zephyr Aircraft Engines 3/2020. SMOH: 0.0. Continental IO-520-C.',
      },
      {
        label: 'Airframe Logbook · Page 84',
        docType: 'Logbook',
        page: 'Page 84',
        snippet: 'Annual 2/14/2024. TTAF 6,812.0. No deferred items. A&P/IA: R. Sanchez 5519022.',
      },
    ],
    quickActions: ['Generate listing description', 'Export buyer package PDF', 'Create document checklist'],
    nextQuestions: [
      'What avionics STCs are installed?',
      'Is there a pre-purchase inspection report from a recent buyer?',
      'What is the asking price justification based on records?',
    ],
  },
  {
    id: 'dealer-2',
    title: 'Document Completeness Check',
    prompt: "What documents are present and what's missing from N2240E's records package?",
    answerTitle: 'Records Package: 11 of 12 Items Present — 1 Missing',
    answerBody:
      "N2240E records package status: PRESENT (11): Original airframe logbook (complete from new), L engine logbook, R engine logbook, propeller logbooks (both), POH/AFM with all revisions, Airworthiness Certificate (original), current registration, all Form 337s (6 major alterations), current AD compliance log, weight & balance with equipment list. MISSING (1): The STC data sheet for the Garmin G500 installation (STC SA01714WI) — the Form 337 references it but the actual STC document is not in the package. This is a significant gap for sophisticated buyers. Recommend obtaining from Garmin/FAA.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Document Index · Current',
        docType: 'Document Checklist',
        page: 'Full Review',
        snippet: '11 of 12 required documents present. Missing: G500 STC data sheet SA01714WI.',
      },
      {
        label: 'Form 337 · G500 Install',
        docType: 'Form 337',
        page: 'Page 1',
        snippet: 'References STC SA01714WI. STC document not found in records package.',
      },
    ],
    quickActions: ['Request STC from FAA', 'Download from DRS', 'Flag in listing notes'],
    nextQuestions: [
      'Can I download the STC from the FAA DRS system?',
      'What other STCs are installed?',
      'Is this a deal-breaker for buyers?',
    ],
  },
  {
    id: 'dealer-3',
    title: 'Value-Supporting Records',
    prompt: 'Which records on N2240E best support our asking price of $425,000?',
    answerTitle: '5 Value-Supporting Factors Identified',
    answerBody:
      "Key value-supporting documentation for N2240E at $425,000: (1) FRESH ENGINE OVERHAULS: Both IO-520-C engines at 680 SMOH (Zephyr, March 2020) — typically adds $40,000–$60,000 value vs. run-out engines. (2) GLASS PANEL: Garmin G500 + GTN 750 + GFC 500 — market premium of $25,000–$35,000. (3) COMPLETE ORIGINAL LOGS: From new. Difficult to find in a '78 Baron. (4) NO DAMAGE HISTORY: Supports clean title premium. (5) RECENT ANNUAL: February 2024, no deferred items — buyer confidence. These five factors strongly support the asking price relative to comparable '78 Baron 58 listings at $360,000–$420,000 without these features.",
    confidence: 'medium',
    sourceCards: [
      {
        label: 'Engine Logbooks · SMOH Data',
        docType: 'Engine Logbook',
        page: 'Page 1',
        snippet: 'Both engines overhauled 3/2020. 680 SMOH. Fresh engines typically +$50K value.',
      },
      {
        label: 'Avionics 337s · G500/GTN750',
        docType: 'Form 337',
        page: 'Multiple',
        snippet: 'G500, GTN 750, GFC 500 installed per STC. Combined market premium $25K–$35K.',
      },
    ],
    quickActions: ['Generate value analysis report', 'Compare to VREF', 'Create listing highlights'],
    nextQuestions: [
      'What is the current VREF value for this Baron?',
      'How does this aircraft compare to similar listings?',
      'What disclosures are required in the listing?',
    ],
  },
  {
    id: 'dealer-4',
    title: 'AD Status for Listing',
    prompt: 'Summarize the AD compliance status for N2240E in terms a buyer can understand',
    answerTitle: 'All 23 Applicable ADs Compliant — Clean Record',
    answerBody:
      "N2240E has 23 applicable Airworthiness Directives covering the airframe, both engines, and propellers. All 23 are documented as compliant as of the February 2024 annual inspection. In plain terms for buyers: There are no outstanding safety compliance items, no open FAA directives, and no upcoming ADs that are immediately due. The only near-term AD item is a recurring engine inspection AD (AD 2013-22-01, Continental IO-520 crankshaft) due at 700 SMOH — approximately 20 hours from now. Seller should complete this before closing or price accordingly.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'AD Compliance Log · 23 entries',
        docType: 'AD Log',
        page: 'Pages 1–6',
        snippet: 'All 23 ADs compliant as of 2/14/2024. Next action: AD 2013-22-01 at 700 SMOH.',
      },
      {
        label: 'Airframe Logbook · Page 84',
        docType: 'Logbook',
        page: 'Page 84',
        snippet: 'Annual 2/2024. AD review complete — all compliant. See AD log attached.',
      },
    ],
    quickActions: ['Export AD summary for buyer', 'Calculate AD 2013-22-01 due date', 'Add to listing disclosure'],
    nextQuestions: [
      'What does AD 2013-22-01 require exactly?',
      'How much will the upcoming AD compliance cost?',
      'Should we complete it before listing?',
    ],
  },
]

// ─── FLEET ADMIN ─────────────────────────────────────────────────────────────

const fleetAdminScenarios: RoleScenario[] = [
  {
    id: 'fleet-1',
    title: '100-Hour Status Across Fleet',
    prompt: 'Show me the 100-hour inspection status for all aircraft in our fleet',
    answerTitle: 'Fleet 100-Hour Status — 1 Aircraft Overdue, 2 Due Within 15 Hours',
    answerBody:
      "Fleet 100-hour inspection status as of today: N8202L (Cessna 172S) — 28.2 hours remaining (due at 4,317.3, current 4,289.1). SCHEDULE NOW. N4409K (Piper PA-28) — 5.8 hours remaining (due at 2,218.0, current 2,212.2). URGENT — schedule immediately. N3301H (Cessna 172R) — 67.4 hours remaining. Normal. N6614T (Piper PA-28R) — OVERDUE by 4.1 hours (due at 1,890.0, current 1,894.1). GROUND AIRCRAFT until inspection completed. N2240E (Beechcraft Baron) — not subject to 100-hour (owner-operated under 91). Total: 1 grounded, 2 require scheduling, 1 normal, 1 exempt.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Fleet Inspection Tracker · Live',
        docType: 'Fleet Dashboard',
        page: 'Current Status',
        snippet: 'N6614T OVERDUE 4.1 hrs. N4409K due in 5.8 hrs. N8202L due in 28.2 hrs.',
      },
      {
        label: 'N6614T Logbook · Page 52',
        docType: 'Logbook',
        page: 'Page 52',
        snippet: 'Last 100-hr at Hobbs 1,890.0. Date: 11/14/2023. Current Hobbs: 1,894.1.',
      },
    ],
    quickActions: ['Ground N6614T', 'Schedule N4409K inspection', 'Export fleet status report'],
    nextQuestions: [
      'Who is available to perform the 100-hour on N6614T?',
      'What is the cost impact of the overdue inspection?',
      'Generate a fleet maintenance schedule for the next 90 days',
    ],
  },
  {
    id: 'fleet-2',
    title: 'Recurring Squawk Analysis',
    prompt: 'Which squawks are repeating across our fleet and which aircraft have the most unresolved issues?',
    answerTitle: '3 Recurring Issue Patterns Found Across 5 Aircraft',
    answerBody:
      "Fleet squawk analysis reveals three recurring patterns: (1) OIL PRESSURE FLUCTUATION: Reported on N8202L (twice, 2022 and 2023) and N3301H (once, 2023). All resolved by oil pressure sender replacement. Pattern suggests age-related sender failures across the fleet — consider proactive replacement. (2) STIFF BRAKE PEDALS: N4409K (2022) and N6614T (2023). Both resolved with master cylinder rebuild. (3) COMM RADIO SQUELCH ISSUES: N3301H Garmin GNC 255 (2022) and N8202L Garmin GNS 430W (2023). Possible age-related radio failures. N6614T has the most open squawks (2 unresolved): inop carb heat temp gauge and sticky throttle friction lock.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Fleet Squawk Summary · 2022–2024',
        docType: 'Squawk Analysis',
        page: 'Aggregate Report',
        snippet: 'Oil pressure senders: 3 failures across 2 aircraft. Brake cylinders: 2 rebuilds.',
      },
      {
        label: 'N6614T Squawk Log · Current',
        docType: 'Squawk Log',
        page: 'Open Items',
        snippet: '2 open squawks: carb heat temp gauge inop; throttle friction lock sticky.',
      },
    ],
    quickActions: ['Generate fleet squawk report', 'Order oil pressure senders fleet-wide', 'Schedule N6614T squawk repair'],
    nextQuestions: [
      'What is the average time to close squawks in our fleet?',
      'Which mechanic handles most of our squawk repairs?',
      'Should we replace oil pressure senders fleet-wide proactively?',
    ],
  },
  {
    id: 'fleet-3',
    title: 'Missing Document Audit',
    prompt: 'Run a document completeness audit across our entire fleet and flag any missing records',
    answerTitle: 'Fleet Document Audit: 4 Gaps Found Across 3 Aircraft',
    answerBody:
      "Fleet document audit results: N8202L — Complete. All documents present. N4409K — MISSING: Original airworthiness certificate (copy on file but original not located). This is a required-on-board document per 14 CFR 91.203. N3301H — MISSING: Weight & balance for avionics upgrade (GNS 430 installed 2018, but W&B not updated in file). N6614T — MISSING: (1) AD compliance log (entries are in logbook margins but no formal log). (2) Form 337 for intercom installation (paperwork referenced but not on file). N2240E — Complete. Action required: N4409K cannot be operated until original AW certificate is located or replacement obtained from FAA.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Fleet Document Index · Audit',
        docType: 'Document Audit',
        page: 'All Aircraft',
        snippet: '4 document gaps across 3 aircraft. N4409K: missing original AW certificate.',
      },
      {
        label: '14 CFR 91.203 · (a)(1)',
        docType: 'Regulation Reference',
        page: '§91.203(a)(1)',
        snippet: 'No person may operate an aircraft unless it has an appropriate airworthiness certificate on board.',
      },
    ],
    quickActions: ['Ground N4409K', 'Request replacement AW cert from FAA', 'Update N3301H weight & balance'],
    nextQuestions: [
      'How do I get a replacement airworthiness certificate from the FAA?',
      'How urgent is the N3301H weight & balance issue?',
      'Generate a corrective action plan for all gaps',
    ],
  },
  {
    id: 'fleet-4',
    title: 'Annual Inspection Schedule',
    prompt: 'What annuals are coming up in the next 90 days across the fleet and who should perform them?',
    answerTitle: '3 Annuals Due in Next 90 Days — Schedule Within 2 Weeks',
    answerBody:
      "Fleet annual inspection schedule — next 90 days: N8202L (Cessna 172S) — Annual due April 30, 2025 (28 days). Preferred IA: James Vickers at Desert Sky Maintenance. Budget estimate: $1,200–$1,800. N4409K (Piper PA-28) — Annual due May 15, 2025 (43 days). Last performed by Blue Ridge Aviation. Note: cannot fly until AW cert issue resolved. N3301H (Cessna 172R) — Annual due June 20, 2025 (79 days). No preferred IA on record — assign to Desert Sky or find local IA. N6614T and N2240E annuals not due for 6+ months. Recommend scheduling all three within the next 14 days to avoid scheduling conflicts at maintenance shops.",
    confidence: 'high',
    sourceCards: [
      {
        label: 'Fleet Annual Tracker · 90-Day View',
        docType: 'Inspection Tracker',
        page: 'Dashboard',
        snippet: '3 annuals due: N8202L (4/30), N4409K (5/15), N3301H (6/20). Schedule now.',
      },
      {
        label: 'N8202L Logbook · Page 49',
        docType: 'Logbook',
        page: 'Page 49',
        snippet: 'Last annual 4/3/2024. Next due 4/30/2025. IA: Vickers 4812093.',
      },
    ],
    quickActions: ['Schedule all three annuals', 'Send IA availability requests', 'Export 90-day maintenance calendar'],
    nextQuestions: [
      'What is the combined budget for all three annuals?',
      'Can one shop do all three to save money?',
      'What squawks should I expect at each annual?',
    ],
  },
]

// ─── ROLE DEFINITIONS ────────────────────────────────────────────────────────

export const ROLES: RoleDefinition[] = [
  {
    id: 'mechanic',
    label: 'A&P Mechanic',
    shortLabel: 'Mechanic',
    icon: 'Wrench',
    description: 'Find part numbers, service history, timing specs, and draft logbook entries',
    color: 'blue',
    scenarios: mechanicScenarios,
  },
  {
    id: 'ia',
    label: 'IA Inspector',
    shortLabel: 'IA',
    icon: 'ClipboardCheck',
    description: 'Review AD compliance, 337 history, and prepare annual sign-off documentation',
    color: 'indigo',
    scenarios: iaScenarios,
  },
  {
    id: 'owner',
    label: 'Aircraft Owner',
    shortLabel: 'Owner',
    icon: 'Key',
    description: 'Track annuals, engine status, major maintenance, and upcoming service needs',
    color: 'violet',
    scenarios: ownerScenarios,
  },
  {
    id: 'pilot',
    label: 'Pilot',
    shortLabel: 'Pilot',
    icon: 'PlaneTakeoff',
    description: 'Look up POH specs, check inspections, fuel capacity, and open squawks',
    color: 'sky',
    scenarios: pilotScenarios,
  },
  {
    id: 'faaInspector',
    label: 'FAA Inspector',
    shortLabel: 'FAA',
    icon: 'Shield',
    description: 'Verify airworthiness documents, repair history, and record continuity',
    color: 'red',
    scenarios: faaInspectorScenarios,
  },
  {
    id: 'buyer',
    label: 'Aircraft Buyer',
    shortLabel: 'Buyer',
    icon: 'Search',
    description: 'Investigate damage history, engine time, record quality, and prebuy flags',
    color: 'amber',
    scenarios: buyerScenarios,
  },
  {
    id: 'dealer',
    label: 'Dealer / Broker',
    shortLabel: 'Dealer',
    icon: 'Briefcase',
    description: 'Create buyer-ready summaries, check document completeness, and support listings',
    color: 'emerald',
    scenarios: dealerScenarios,
  },
  {
    id: 'fleetAdmin',
    label: 'Fleet Admin',
    shortLabel: 'Fleet',
    icon: 'LayoutGrid',
    description: 'Monitor 100-hour status, recurring squawks, missing records, and annual schedules',
    color: 'orange',
    scenarios: fleetAdminScenarios,
  },
]

// Aliases for backward compat and task spec compliance
export const roleDefinitions = ROLES
export const DEFAULT_ROLE: SimulatorRole = 'mechanic'
