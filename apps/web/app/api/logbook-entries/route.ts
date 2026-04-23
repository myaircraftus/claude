import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";

// Mirror of migration 016 CHECK constraint for logbook_entries.entry_type
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

// Mirror of migration 016 CHECK constraint for logbook_entries.status
export const VALID_STATUSES = ["draft", "final", "signed", "amended"] as const;

export const VALID_LOGBOOK_TYPES = [
  "airframe",
  "engine",
  "prop",
  "avionics",
  "multiple",
] as const;

type EntryType = typeof VALID_ENTRY_TYPES[number];
type EntryStatus = typeof VALID_STATUSES[number];

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const orgId = ctx.organizationId;

  const { searchParams } = new URL(req.url);
  const aircraft_id = searchParams.get("aircraft_id");
  const work_order_id = searchParams.get("work_order_id");
  const search = searchParams.get("search");
  const entry_type_param = searchParams.get("entry_type");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");

  let query = supabase
    .from("logbook_entries")
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, entry_text,
      total_time_after, hobbs_time, tach_time, status,
      logbook_type, mechanic_name, mechanic_cert_number, cert_type,
      parts_used, manual_references, ad_references, sb_references,
      return_to_service, customer_summary,
      created_at, updated_at,
      aircraft:aircraft_id (id, tail_number, make, model, serial_number, engine_model)
    `)
    .eq("organization_id", orgId)
    .order("entry_date", { ascending: false });

  if (aircraft_id) query = query.eq("aircraft_id", aircraft_id);
  if (work_order_id) query = query.eq("work_order_id", work_order_id);
  if (search) query = (query as any).ilike("entry_text", `%${search}%`);
  if (entry_type_param && VALID_ENTRY_TYPES.includes(entry_type_param as any)) {
    query = query.eq("entry_type", entry_type_param);
  }
  if (date_from) query = query.gte("entry_date", date_from);
  if (date_to) query = query.lte("entry_date", date_to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const user = ctx.user;
  const orgId = ctx.organizationId;

  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept either legacy `description` or canonical `entry_text` from the client.
  const entryText: string | undefined = (body.entry_text ?? body.description)?.toString();
  if (!body.aircraft_id || !body.entry_date || !entryText) {
    return NextResponse.json(
      { error: "aircraft_id, entry_date, and entry_text (or description) are required" },
      { status: 400 }
    );
  }

  const entry_type: EntryType = (body.entry_type ?? "maintenance") as EntryType;
  if (!VALID_ENTRY_TYPES.includes(entry_type)) {
    return NextResponse.json(
      { error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const status: EntryStatus = (body.status ?? "draft") as EntryStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  if (body.logbook_type && !VALID_LOGBOOK_TYPES.includes(body.logbook_type)) {
    return NextResponse.json(
      { error: `Invalid logbook_type. Must be one of: ${VALID_LOGBOOK_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve work order (if provided) to verify ownership and capture its number
  const { data: workOrder } = body.work_order_id
    ? await supabase
        .from("work_orders")
        .select("id, work_order_number, aircraft_id")
        .eq("id", body.work_order_id)
        .eq("organization_id", orgId)
        .maybeSingle()
    : { data: null };

  const nowIso = new Date().toISOString();

  // Map client fields → actual logbook_entries schema:
  //   description      → entry_text
  //   total_time       → total_time_after
  //   hobbs_in/out     → hobbs_time (single value; fall through to either)
  //   references_used  → split into manual_references + sb_references
  //   ad_numbers       → ad_references
  //   signed_at        → (no column; preserved implicitly via status='signed')
  const insertPayload: Record<string, any> = {
    organization_id: orgId,
    aircraft_id: body.aircraft_id,
    work_order_id: workOrder?.id ?? null,
    entry_type,
    entry_date: body.entry_date,
    hobbs_time: body.hobbs_time ?? body.hobbs_out ?? body.hobbs_in ?? null,
    tach_time: body.tach_time ?? null,
    total_time_after: body.total_time_after ?? body.total_time ?? 0,
    entry_text: entryText,
    customer_summary: body.customer_summary ?? null,
    parts_used: Array.isArray(body.parts_used) ? body.parts_used : [],
    manual_references: Array.isArray(body.manual_references) ? body.manual_references : (Array.isArray(body.references_used) ? body.references_used : []),
    sb_references: Array.isArray(body.sb_references) ? body.sb_references : [],
    ad_references: Array.isArray(body.ad_references) ? body.ad_references : (Array.isArray(body.ad_numbers) ? body.ad_numbers : []),
    logbook_type: body.logbook_type ?? null,
    mechanic_name: body.mechanic_name ?? null,
    mechanic_cert_number: body.mechanic_cert_number ?? null,
    cert_type: body.cert_type ?? null,
    return_to_service: body.return_to_service ?? false,
    status,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("logbook_entries")
    .insert(insertPayload)
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
      logbook_type, mechanic_name, mechanic_cert_number, cert_type,
      parts_used, references_used, ad_numbers, work_order_ref,
      created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
