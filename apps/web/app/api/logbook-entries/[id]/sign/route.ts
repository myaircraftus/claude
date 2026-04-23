import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";

const VALID_CERT_TYPES = ["A&P", "IA", "Repairman"] as const;
type CertType = typeof VALID_CERT_TYPES[number];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveRequestOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const user = ctx.user;
  const orgId = ctx.organizationId;

  if (!MECHANIC_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: {
    mechanic_name?: string;
    mechanic_cert_number?: string;
    cert_type?: CertType;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mechanic_name = (body.mechanic_name ?? "").trim();
  const mechanic_cert_number = (body.mechanic_cert_number ?? "").trim();
  const cert_type = body.cert_type;

  if (!mechanic_name) {
    return NextResponse.json({ error: "mechanic_name is required" }, { status: 400 });
  }
  if (!mechanic_cert_number) {
    return NextResponse.json({ error: "mechanic_cert_number is required" }, { status: 400 });
  }
  if (!cert_type || !VALID_CERT_TYPES.includes(cert_type)) {
    return NextResponse.json(
      { error: `cert_type must be one of: ${VALID_CERT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Load current status to enforce the state machine
  const { data: existing, error: fetchErr } = await supabase
    .from("logbook_entries")
    .select("id, organization_id, status")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "draft" && existing.status !== "final") {
    return NextResponse.json(
      { error: `Cannot sign entry with status '${existing.status}' — must be draft or final` },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("logbook_entries")
    .update({
      status: "signed",
      signed_at: nowIso,
      signed_by: user.id,
      mechanic_name,
      mechanic_cert_number,
      cert_type,
      updated_at: nowIso,
    })
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
      logbook_type, mechanic_name, mechanic_cert_number, cert_type,
      parts_used, references_used, ad_numbers, work_order_ref,
      created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
