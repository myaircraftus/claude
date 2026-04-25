import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";
import {
  VALID_ENTRY_TYPES,
  VALID_STATUSES,
  VALID_LOGBOOK_TYPES,
} from "@/lib/logbook/constants";

const ENTRY_SELECT = `
  id, aircraft_id, work_order_id, entry_type, entry_date, description,
  total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
  logbook_type, mechanic_name, mechanic_cert_number, cert_type,
  parts_used, references_used, ad_numbers, work_order_ref,
  created_at, updated_at,
  aircraft:aircraft_id (id, tail_number, make, model, serial_number, engine_model)
`;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveRequestOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const orgId = ctx.organizationId;

  const { data, error } = await supabase
    .from("logbook_entries")
    .select(ENTRY_SELECT)
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveRequestOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
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

  // Load current entry to check status
  const { data: existing, error: fetchErr } = await supabase
    .from("logbook_entries")
    .select("id, organization_id, status")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot edit entry with status '${existing.status}' — only draft entries are editable` },
      { status: 409 }
    );
  }

  // Validate enums if provided
  if (body.entry_type !== undefined && !VALID_ENTRY_TYPES.includes(body.entry_type)) {
    return NextResponse.json(
      { error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  if (body.logbook_type !== undefined && body.logbook_type !== null
      && !VALID_LOGBOOK_TYPES.includes(body.logbook_type)) {
    return NextResponse.json(
      { error: `Invalid logbook_type. Must be one of: ${VALID_LOGBOOK_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Whitelist updatable fields
  const allowed = [
    "entry_type",
    "entry_date",
    "description",
    "hobbs_in",
    "hobbs_out",
    "tach_time",
    "total_time",
    "parts_used",
    "references_used",
    "ad_numbers",
    "logbook_type",
    "mechanic_name",
    "mechanic_cert_number",
    "status",
    "work_order_id",
  ] as const;

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (body[key] !== undefined) updatePayload[key] = body[key];
  }

  const { data, error } = await supabase
    .from("logbook_entries")
    .update(updatePayload)
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .select(ENTRY_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
