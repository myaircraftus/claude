import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .single();
  return data?.organization_id ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const aircraft_id = searchParams.get("aircraft_id");
  const work_order_id = searchParams.get("work_order_id");

  let query = supabase
    .from("logbook_entries")
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_out, tach_time, status, signed_at, created_at, updated_at,
      aircraft:aircraft_id (id, tail_number, make, model, serial_number, engine_model)
    `)
    .eq("organization_id", orgId)
    .order("entry_date", { ascending: false });

  if (aircraft_id) query = query.eq("aircraft_id", aircraft_id);
  if (work_order_id) query = query.eq("work_order_id", work_order_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getOrgId(supabase, user.id);
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 403 });

  const body = await req.json();
  if (!body.aircraft_id || !body.entry_date || !body.description) {
    return NextResponse.json(
      { error: "aircraft_id, entry_date, and description are required" },
      { status: 400 }
    );
  }

  const { data: workOrder } = body.work_order_id
    ? await supabase
        .from("work_orders")
        .select("id, work_order_number, aircraft_id")
        .eq("id", body.work_order_id)
        .eq("organization_id", orgId)
        .maybeSingle()
    : { data: null };

  const { data, error } = await supabase
    .from("logbook_entries")
    .insert({
      organization_id: orgId,
      aircraft_id: body.aircraft_id,
      work_order_id: workOrder?.id ?? null,
      entry_type: body.entry_type ?? "maintenance",
      entry_date: body.entry_date,
      hobbs_out: body.hobbs_out ?? null,
      tach_time: body.tach_time ?? null,
      total_time: body.total_time ?? 0,
      description: body.description,
      parts_used: body.parts_used ?? [],
      references_used: body.references_used ?? [],
      work_order_ref: workOrder?.work_order_number ?? null,
      status: body.status ?? "draft",
      signed_at: body.status === "signed" ? new Date().toISOString() : null,
      signed_by: body.status === "signed" ? user.id : null,
      created_by: user.id,
    })
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_out, tach_time, status, signed_at, created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
