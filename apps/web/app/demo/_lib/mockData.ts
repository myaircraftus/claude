// Mock data shared by the /demo route.  These objects are designed so that the
// real client components in components/redesign/* render meaningfully without
// the real API.  When a field is unknown the real component is tolerant of
// nulls / empty arrays.

const DEMO_ORG_ID = "demo-org";

export const demoUser = {
  id: "demo-user",
  email: "demo@myaircraft.us",
  user_metadata: { full_name: "Demo Owner" },
};

export const demoProfile = {
  id: "demo-user",
  email: "demo@myaircraft.us",
  full_name: "Demo Owner",
  avatar_url: null,
  job_title: "Aircraft Owner",
  is_platform_admin: false,
  handle: "demo-owner",
  persona: "owner",
};

export const demoMembership = {
  organization_id: DEMO_ORG_ID,
  role: "owner",
};

export const demoMe = {
  user: demoUser,
  profile: demoProfile,
  membership: demoMembership,
  organization_id: DEMO_ORG_ID,
  role: "owner",
};

export const demoOrganization = {
  id: DEMO_ORG_ID,
  slug: "demo",
  name: "Skyline Aviation",
  business_name: "Skyline Aviation LLC",
  contact_email: "ops@skyline-demo.aero",
  phone: "(555) 010-0420",
  website: "https://skyline-demo.aero",
  address_line1: "1200 Hangar Way",
  address_line2: "Suite 4",
  city: "Boulder",
  state: "CO",
  postal_code: "80301",
  country: "United States",
  type: "owner",
  logo_url: null,
};

export const demoAircraft = [
  {
    id: "demo-ac-1",
    organization_id: DEMO_ORG_ID,
    tail_number: "N12345",
    make: "Cessna",
    model: "182 Skylane",
    year: 2014,
    serial_number: "18283456",
    registration_status: "Active",
    airworthiness_class: "Standard",
    annual_due: "2026-08-12",
    last_annual: "2025-08-04",
    total_time: 1842.6,
    engine_time: 432.1,
    home_base: "KBJC",
    customer_id: "demo-cust-1",
    primary_owner_name: "Demo Owner",
    image_url: null,
  },
  {
    id: "demo-ac-2",
    organization_id: DEMO_ORG_ID,
    tail_number: "N67890",
    make: "Beechcraft",
    model: "G36 Bonanza",
    year: 2008,
    serial_number: "E-3712",
    registration_status: "Active",
    airworthiness_class: "Standard",
    annual_due: "2026-06-30",
    last_annual: "2025-06-22",
    total_time: 3211.0,
    engine_time: 980.4,
    home_base: "KAPA",
    customer_id: "demo-cust-2",
    primary_owner_name: "Highline Holdings LLC",
    image_url: null,
  },
];

export const demoCustomers = [
  {
    id: "demo-cust-1",
    organization_id: DEMO_ORG_ID,
    name: "Demo Owner",
    email: "demo@myaircraft.us",
    phone: "(555) 010-0420",
    address_city: "Boulder",
    address_state: "CO",
    aircraft_count: 1,
    created_at: "2025-01-08T10:00:00Z",
  },
  {
    id: "demo-cust-2",
    organization_id: DEMO_ORG_ID,
    name: "Highline Holdings LLC",
    email: "ops@highline.demo",
    phone: "(555) 410-2002",
    address_city: "Centennial",
    address_state: "CO",
    aircraft_count: 1,
    created_at: "2024-11-12T10:00:00Z",
  },
];

export const demoSquawks = [
  {
    id: "demo-sq-1",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-1",
    title: "Right brake pulsation on rollout",
    description:
      "Pilot reports a noticeable pulsation in the right main brake pedal during the last three landings at KBJC.",
    status: "open",
    priority: "high",
    reported_by: "Demo Owner",
    created_at: "2026-04-22T13:14:00Z",
    aircraft: { tail_number: "N12345" },
  },
  {
    id: "demo-sq-2",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-1",
    title: "Garmin G500 occasional reboot",
    description: "PFD reboots roughly once per 5 hours of flight. Database current.",
    status: "in_progress",
    priority: "medium",
    reported_by: "Demo Owner",
    created_at: "2026-04-18T09:02:00Z",
    aircraft: { tail_number: "N12345" },
  },
  {
    id: "demo-sq-3",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-2",
    title: "Cabin door seal worn",
    description: "Light wind noise above 140 KIAS — door seal appears to be at end of life.",
    status: "open",
    priority: "low",
    reported_by: "Highline Holdings",
    created_at: "2026-04-15T17:20:00Z",
    aircraft: { tail_number: "N67890" },
  },
  {
    id: "demo-sq-4",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-2",
    title: "Annual inspection due 2026-06-30",
    description: "Schedule annual inspection before 2026-06-30. Includes ELT battery.",
    status: "open",
    priority: "medium",
    reported_by: "Maintenance Reminder",
    created_at: "2026-04-12T08:00:00Z",
    aircraft: { tail_number: "N67890" },
  },
];

export const demoWorkOrders = [
  {
    id: "demo-wo-1",
    organization_id: DEMO_ORG_ID,
    number: "WO-1042",
    title: "Right brake overhaul + rotor inspection",
    status: "in_progress",
    priority: "high",
    aircraft_id: "demo-ac-1",
    customer_id: "demo-cust-1",
    estimated_total: 1280.0,
    actual_total: 0,
    created_at: "2026-04-22T13:30:00Z",
    aircraft: { tail_number: "N12345" },
    customer: { name: "Demo Owner" },
  },
  {
    id: "demo-wo-2",
    organization_id: DEMO_ORG_ID,
    number: "WO-1041",
    title: "G500 reboot diagnostic",
    status: "scheduled",
    priority: "medium",
    aircraft_id: "demo-ac-1",
    customer_id: "demo-cust-1",
    estimated_total: 480.0,
    actual_total: 0,
    created_at: "2026-04-19T09:30:00Z",
    aircraft: { tail_number: "N12345" },
    customer: { name: "Demo Owner" },
  },
];

export const demoEstimates = [
  {
    id: "demo-est-1",
    organization_id: DEMO_ORG_ID,
    number: "EST-2098",
    title: "Cabin door seal replacement",
    status: "sent",
    customer_id: "demo-cust-2",
    aircraft_id: "demo-ac-2",
    total: 720.0,
    created_at: "2026-04-16T11:00:00Z",
    customer: { name: "Highline Holdings LLC" },
    aircraft: { tail_number: "N67890" },
  },
  {
    id: "demo-est-2",
    organization_id: DEMO_ORG_ID,
    number: "EST-2099",
    title: "Annual + ELT battery (N67890)",
    status: "draft",
    customer_id: "demo-cust-2",
    aircraft_id: "demo-ac-2",
    total: 2980.0,
    created_at: "2026-04-12T08:30:00Z",
    customer: { name: "Highline Holdings LLC" },
    aircraft: { tail_number: "N67890" },
  },
];

export const demoInvoices = [
  {
    id: "demo-inv-1",
    organization_id: DEMO_ORG_ID,
    number: "INV-3401",
    status: "paid",
    customer_id: "demo-cust-1",
    aircraft_id: "demo-ac-1",
    total: 412.0,
    amount_paid: 412.0,
    created_at: "2026-03-20T17:00:00Z",
    paid_at: "2026-03-21T10:24:00Z",
    customer: { name: "Demo Owner" },
    aircraft: { tail_number: "N12345" },
  },
  {
    id: "demo-inv-2",
    organization_id: DEMO_ORG_ID,
    number: "INV-3402",
    status: "open",
    customer_id: "demo-cust-2",
    aircraft_id: "demo-ac-2",
    total: 1840.0,
    amount_paid: 0,
    created_at: "2026-04-08T11:30:00Z",
    customer: { name: "Highline Holdings LLC" },
    aircraft: { tail_number: "N67890" },
  },
  {
    id: "demo-inv-3",
    organization_id: DEMO_ORG_ID,
    number: "INV-3403",
    status: "open",
    customer_id: "demo-cust-1",
    aircraft_id: "demo-ac-1",
    total: 285.0,
    amount_paid: 0,
    created_at: "2026-04-19T16:10:00Z",
    customer: { name: "Demo Owner" },
    aircraft: { tail_number: "N12345" },
  },
];

export const demoLogbookEntries = [
  {
    id: "demo-lb-1",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-1",
    work_order_id: "demo-wo-1",
    entry_type: "airframe",
    summary: "C/W right brake assembly overhaul IAW Cleveland S/L 92.",
    body: "Replaced right brake disc, pads, and o-rings. Bled both brakes. Ground checks normal.",
    technician_name: "Demo Mechanic",
    certificate_number: "A&P 3214567 IA",
    created_at: "2026-04-23T15:48:00Z",
    aircraft: { tail_number: "N12345" },
  },
  {
    id: "demo-lb-2",
    organization_id: DEMO_ORG_ID,
    aircraft_id: "demo-ac-1",
    work_order_id: null,
    entry_type: "engine",
    summary: "Oil and filter change. SAE 20W-50, Tempest filter.",
    body: "Drained 8 qt of oil, replaced with 8 qt Phillips 20W-50. Cut and inspected oil filter — no metal.",
    technician_name: "Demo Mechanic",
    certificate_number: "A&P 3214567",
    created_at: "2026-03-30T11:00:00Z",
    aircraft: { tail_number: "N12345" },
  },
];

export const demoTeam = [
  {
    id: "demo-tm-1",
    user_id: "demo-user",
    full_name: "Demo Owner",
    email: "demo@myaircraft.us",
    role: "owner",
    status: "active",
    invited_at: null,
    accepted_at: "2025-01-08T10:00:00Z",
  },
  {
    id: "demo-tm-2",
    user_id: "demo-mech",
    full_name: "Alex Carter",
    email: "alex@skyline-demo.aero",
    role: "mechanic",
    status: "active",
    invited_at: "2025-01-09T10:00:00Z",
    accepted_at: "2025-01-09T11:00:00Z",
  },
];

export const demoReminders = [
  {
    id: "demo-rem-1",
    aircraft_id: "demo-ac-1",
    title: "VOR check",
    due_date: "2026-05-15",
    status: "open",
    aircraft: { tail_number: "N12345" },
  },
  {
    id: "demo-rem-2",
    aircraft_id: "demo-ac-2",
    title: "Annual inspection",
    due_date: "2026-06-30",
    status: "open",
    aircraft: { tail_number: "N67890" },
  },
];

export const demoIntegrations: any[] = [];

export const demoFaraimEntitlement = {
  entitled: true,
  source: "demo",
  reason: null,
  organization_id: DEMO_ORG_ID,
};

export const demoFaraimSession = {
  url: "https://far-aim-demo.example.com",
  expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
};

export const demoBillingStatus = {
  has_subscription: true,
  status: "active",
  trial_ends_at: null,
  current_period_end: "2026-05-25T00:00:00Z",
};

export const demoPartsSearchResult = {
  results: [
    {
      id: "demo-part-1",
      part_number: "066-08000-2700",
      description: "Cleveland brake disc — McCauley 30-95 wheel",
      vendor: "Aircraft Spruce",
      price: 312.0,
      stock: 6,
      url: "https://www.aircraftspruce.com",
    },
    {
      id: "demo-part-2",
      part_number: "071-00500",
      description: "Cleveland brake pad set",
      vendor: "Aircraft Spruce",
      price: 84.5,
      stock: 14,
      url: "https://www.aircraftspruce.com",
    },
    {
      id: "demo-part-3",
      part_number: "AA59E20",
      description: "Aeroshell Avgas oil filter, Champion CH48108-1",
      vendor: "Aviall",
      price: 27.4,
      stock: 22,
      url: "https://www.aviall.com",
    },
  ],
};

export function buildAskResponse(question: string) {
  const trimmed = question.trim();
  return {
    answer:
      `**Demo answer for:** ${trimmed || "(no question)"}\n\n` +
      "In the live app this is a real LLM response grounded in your aircraft records, your uploaded logbooks, and the FAR/AIM. " +
      "Try asking *When is my annual due?* or *Show my last oil change*.\n\n" +
      "_Sign up to ask real questions about your fleet._",
    citations: [
      { source: "14 CFR § 91.409", url: "https://www.ecfr.gov/current/title-14/section-91.409" },
      { source: "Aircraft logbook · N12345 · 2026-04-23", url: "#" },
    ],
    answer_id: "demo-answer",
  };
}
