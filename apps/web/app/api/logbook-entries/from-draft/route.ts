import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";
import { VALID_ENTRY_TYPES, VALID_LOGBOOK_TYPES } from "../route";

type DraftRow = {
  id: string;
  organization_id: string;
  aircraft_id: string;
  entry_type: string | null;
  logbook_type: string | null;
  ai_generated_text: string | null;
  edited_text: string | null;
  structured_fields: Record<string, any> | null;
  converted_to_entry_id: string | null;
};

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0);
}

function mapEntryType(draftType: string | null | undefined): string {
  // Draft types: maintenance, 100hr, annual, oil_change, repair, ad_compliance, overhaul, custom
  // Entry types (migration 016): maintenance, annual, 100hr, discrepancy, ad_compliance,
  //                              sb_compliance, component_replacement, oil_change,
  //                              return_to_service, major_repair, major_alteration,
  //                              owner_preventive
  if (!draftType) return "maintenance";
  const t = draftType.toLowerCase();
  if (VALID_ENTRY_TYPES.includes(t as any)) return t;
  if (t === "repair") return "major_repair";
  if (t === "overhaul") return "component_replacement";
  if (t === "custom") return "maintenance";
  return "maintenance";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .single();
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  if (!MECHANIC_AND_ABOVE.includes(membership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: { draft_id?: string; work_order_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.draft_id) {
    return NextResponse.json({ error: "draft_id is required" }, { status: 400 });
  }

  // Load draft with ownership check
  const { data: draft, error: draftErr } = await supabase
    .from("maintenance_entry_drafts")
    .select(
      "id, organization_id, aircraft_id, entry_type, logbook_type, ai_generated_text, edited_text, structured_fields, converted_to_entry_id"
    )
    .eq("id", body.draft_id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle<DraftRow>();

  if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 500 });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  // Idempotent: if already converted, return the existing entry
  if (draft.converted_to_entry_id) {
    const { data: existing } = await supabase
      .from("logbook_entries")
      .select("*")
      .eq("id", draft.converted_to_entry_id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ entry: existing, draft_id: draft.id, already_converted: true });
    }
    // fall through: the linked entry was deleted — allow re-conversion
  }

  const fields = draft.structured_fields ?? {};
  const description = draft.edited_text ?? draft.ai_generated_text ?? "";
  if (!description.trim()) {
    return NextResponse.json(
      { error: "Draft has no entry text to convert" },
      { status: 400 }
    );
  }

  const entryDateRaw = toStringOrNull(fields.date);
  const entry_date = entryDateRaw ?? new Date().toISOString().split("T")[0];

  const entryType = mapEntryType(
    (typeof fields.entry_type === "string" && fields.entry_type) || draft.entry_type || null
  );

  let logbookType: string | null =
    (typeof fields.logbook_type === "string" && fields.logbook_type) || draft.logbook_type || null;
  if (logbookType && !VALID_LOGBOOK_TYPES.includes(logbookType as any)) {
    logbookType = null;
  }

  // Optional work order — validate ownership
  let workOrderId: string | null = body.work_order_id ?? null;
  let workOrderRef: string | null = null;
  if (workOrderId) {
    const { data: wo } = await supabase
      .from("work_orders")
      .select("id, work_order_number")
      .eq("id", workOrderId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    if (wo) {
      workOrderRef = wo.work_order_number ?? null;
    } else {
      workOrderId = null;
    }
  }

  const tachTime = toNumberOrNull(fields.tach_reference) ?? toNumberOrNull(fields.tach_time);
  const totalTime = toNumberOrNull(fields.airframe_tt) ?? toNumberOrNull(fields.total_time) ?? 0;
  const hobbsOut = toNumberOrNull(fields.hobbs_out);
  const hobbsIn = toNumberOrNull(fields.hobbs_in);

  const partsReferenced = toStringArray(fields.parts_referenced);
  const partsUsed = Array.isArray(fields.parts_used)
    ? fields.parts_used
    : partsReferenced.map((p) => ({ part_number: p }));

  const references: string[] = [
    ...toStringArray(fields.ad_references),
    ...toStringArray(fields.sb_references),
  ];
  const referencesUsed = Array.isArray(fields.references_used)
    ? fields.references_used
    : references.map((r) => ({ reference: r }));

  const adNumbers = toStringArray(fields.ad_references);

  const insertPayload: Record<string, any> = {
    organization_id: membership.organization_id,
    aircraft_id: draft.aircraft_id,
    work_order_id: workOrderId,
    draft_id: draft.id,
    entry_type: entryType,
    entry_date,
    hobbs_in: hobbsIn,
    hobbs_out: hobbsOut,
    tach_time: tachTime,
    total_time: totalTime,
    description,
    parts_used: partsUsed,
    references_used: referencesUsed,
    ad_numbers: adNumbers.length > 0 ? adNumbers : null,
    logbook_type: logbookType,
    mechanic_name: toStringOrNull(fields.mechanic_name),
    mechanic_cert_number: toStringOrNull(fields.cert_number ?? fields.mechanic_cert_number),
    work_order_ref: workOrderRef,
    status: "draft",
    created_by: user.id,
  };

  const { data: entry, error: insertErr } = await supabase
    .from("logbook_entries")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Mark draft as converted (best effort)
  await supabase
    .from("maintenance_entry_drafts")
    .update({
      status: "finalized",
      converted_to_entry_id: entry.id,
      converted_at: new Date().toISOString(),
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id)
    .eq("organization_id", membership.organization_id);

  return NextResponse.json({ entry, draft_id: draft.id }, { status: 201 });
}
