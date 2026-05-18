import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";
import { buildClassificationPatch } from "@/lib/taxonomy/format";
import {
  VALID_ENTRY_TYPES,
  VALID_STATUSES,
  VALID_LOGBOOK_TYPES,
  type EntryType,
  type EntryStatus,
} from "@/lib/logbook/constants";
import {
  buildWorkOrderLogbookDraft,
  normalizeEntryType,
  normalizeLogbookStatus,
  normalizeLogbookType,
  normalizeTargetLogbook,
  summarizeWorkOrderSource,
  writeLogbookAudit,
  writeLogbookTimeline,
} from "@/lib/logbook/workflow";
import { getCurrentPersona } from "@/lib/persona/server";
import { applyOwnerLogbookVisibility, OWNER_PERSONA } from "@/lib/logbook/visibility";

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

  // Alias actual DB columns to legacy API field names for UI compatibility.
  // Real schema has: description, total_time, hobbs_in, hobbs_out, references_used, ad_numbers.
  // Legacy shape expected by UI: entry_text, total_time_after, hobbs_time, manual_references, ad_references.
  let query = supabase
    .from("logbook_entries")
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date,
      entry_text:description,
      total_time_after:total_time,
      hobbs_time:hobbs_out,
      hobbs_in, hobbs_out, tach_time, status,
      logbook_type, mechanic_name, mechanic_cert_number, cert_type,
      target_logbook, source_type, source_id, source_context, source_references,
      signer_id, certificate_number, certificate_type, ia_flag, revision_number,
      supersedes_entry_id, entry_hash, pdf_hash, signature_reason, owner_visible,
      ai_review_status, ai_warnings, signature_certificate_id, signature_audit,
      parts_used,
      manual_references:references_used,
      ad_references:ad_numbers,
      work_order_ref,
      ata_code, jasc_code, classification_source, classification_confidence, classification_status,
      created_at, updated_at,
      aircraft:aircraft_id (id, tail_number, make, model, serial_number, engine_model)
    `)
    .eq("organization_id", orgId)
    .order("entry_date", { ascending: false });

  if (aircraft_id) query = query.eq("aircraft_id", aircraft_id);
  if (work_order_id) query = query.eq("work_order_id", work_order_id);
  if (search) query = (query as any).ilike("description", `%${search}%`);
  if (entry_type_param && VALID_ENTRY_TYPES.includes(entry_type_param as any)) {
    query = query.eq("entry_type", entry_type_param);
  }
  if (date_from) query = query.gte("entry_date", date_from);
  if (date_to) query = query.lte("entry_date", date_to);

  // Owner-visibility gate — the owner persona sees only entries published to
  // them (owner_visible) or that they created. Shop/admin see everything.
  // (Defense-in-depth: the logbook_select RLS policy enforces the same rule.)
  let persona = "shop";
  try {
    persona = (await getCurrentPersona()).persona;
  } catch {
    // defensive — ctx already proved a session
  }
  query = applyOwnerLogbookVisibility(query, persona, ctx.user.id);

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

  // An owner-persona member creating an entry → it is owner-visible from the
  // start (owner records belong to the owner). Mechanic/shop drafts stay
  // owner_visible=false until signed/published.
  let creatorPersona = "shop";
  try {
    creatorPersona = (await getCurrentPersona()).persona;
  } catch {
    // defensive — ctx already proved a session
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceType = String(body.source_type ?? (body.work_order_id ? "work_order" : "manual"));
  const targetLogbook = normalizeTargetLogbook(body.target_logbook ?? body.logbook_type ?? "airframe");
  const rawEntryType = body.entry_type == null ? "maintenance" : String(body.entry_type).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!VALID_ENTRY_TYPES.includes(rawEntryType as EntryType)) {
    return NextResponse.json(
      { error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const entry_type: EntryType = normalizeEntryType(rawEntryType);

  const rawStatus = body.status == null ? "draft" : String(body.status).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!VALID_STATUSES.includes(rawStatus as EntryStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  const status: EntryStatus = normalizeLogbookStatus(rawStatus);

  const rawLogbookType = body.logbook_type ?? targetLogbook;
  const logbookType = normalizeLogbookType(rawLogbookType);
  if (rawLogbookType && !logbookType) {
    return NextResponse.json(
      { error: `Invalid logbook_type. Must be one of: ${VALID_LOGBOOK_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve work order (if provided) to verify ownership and capture its number
  const { data: workOrder } = body.work_order_id
    ? await supabase
        .from("work_orders")
        .select(`
          id, work_order_number, aircraft_id, customer_id, status, complaint,
          discrepancy, findings, corrective_action, customer_visible_notes,
          opened_at, closed_at, total_amount
        `)
        .eq("id", body.work_order_id)
        .eq("organization_id", orgId)
        .maybeSingle()
    : { data: null };

  if (body.work_order_id && !workOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const aircraftId = body.aircraft_id ?? workOrder?.aircraft_id ?? null;
  if (!aircraftId) {
    return NextResponse.json(
      { error: "aircraft_id is required before a logbook entry can be saved" },
      { status: 400 }
    );
  }

  const [linesRes, checklistRes] = workOrder
    ? await Promise.all([
        supabase
          .from("work_order_lines")
          .select("*")
          .eq("work_order_id", workOrder.id)
          .eq("organization_id", orgId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("work_order_checklist_items")
          .select("*")
          .eq("work_order_id", workOrder.id)
          .eq("organization_id", orgId)
          .order("sort_order", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const workOrderLines = linesRes.data ?? [];
  const checklistItems = checklistRes.data ?? [];
  const generatedEntryText = workOrder
    ? buildWorkOrderLogbookDraft({
        workOrder,
        lines: workOrderLines,
        checklist: checklistItems,
        targetLogbook,
        entryType: entry_type,
      })
    : "";

  // Accept either legacy `description` or canonical `entry_text` from the client.
  const entryText = ((body.entry_text ?? body.description)?.toString() || generatedEntryText).trim();
  if (!body.entry_date || !entryText) {
    return NextResponse.json(
      { error: "entry_date and entry_text (or a work order source that can draft text) are required" },
      { status: 400 }
    );
  }

  // Map client legacy field names → actual logbook_entries schema.
  // Real columns: description, total_time, hobbs_in, hobbs_out, tach_time,
  //               references_used (jsonb), ad_numbers (text[]), work_order_ref.
  // Dropped from schema (no-op if client still sends them): customer_summary,
  //                sb_references, return_to_service.
  const manualRefs = Array.isArray(body.manual_references) ? body.manual_references
    : Array.isArray(body.references_used) ? body.references_used
    : [];
  const sbRefs = Array.isArray(body.sb_references) ? body.sb_references : [];
  const referencesUsed = [...manualRefs, ...sbRefs];
  const adRefs = Array.isArray(body.ad_references) ? body.ad_references
    : Array.isArray(body.ad_numbers) ? body.ad_numbers
    : [];

  const insertPayload: Record<string, any> = {
    organization_id: orgId,
    aircraft_id: aircraftId,
    work_order_id: workOrder?.id ?? null,
    work_order_ref: workOrder?.work_order_number ?? null,
    entry_type,
    entry_date: body.entry_date,
    hobbs_in: body.hobbs_in ?? null,
    hobbs_out: body.hobbs_out ?? body.hobbs_time ?? null,
    tach_time: body.tach_time ?? null,
    total_time: body.total_time ?? body.total_time_after ?? null,
    description: entryText,
    parts_used: Array.isArray(body.parts_used)
      ? body.parts_used
      : workOrderLines
          .filter((line: any) => line.line_type === "part")
          .map((line: any) => ({
            id: line.id,
            part_number: line.part_number ?? null,
            description: line.description,
            quantity: line.quantity ?? 1,
          })),
    references_used: referencesUsed,
    ad_numbers: adRefs,
    logbook_type: logbookType,
    target_logbook: targetLogbook,
    source_type: sourceType,
    source_id: body.source_id ?? workOrder?.id ?? null,
    source_context: body.source_context ?? {
      source_context: sourceType === "work_order" ? "work_order" : "logbook_module",
      launch_route: body.launch_route ?? "/logbook-entries",
      aircraft_id: aircraftId,
      work_order_id: workOrder?.id ?? null,
    },
    source_references: {
      ...((body.source_references && !Array.isArray(body.source_references)) ? body.source_references : {}),
      ...summarizeWorkOrderSource({ workOrder, lines: workOrderLines, checklist: checklistItems }),
    },
    mechanic_name: body.mechanic_name ?? null,
    mechanic_cert_number: body.mechanic_cert_number ?? null,
    cert_type: body.cert_type ?? null,
    certificate_number: body.certificate_number ?? body.mechanic_cert_number ?? null,
    certificate_type: body.certificate_type ?? body.cert_type ?? null,
    ia_flag: Boolean(body.ia_flag),
    ai_review_status: body.ai_review_status ?? (sourceType === "work_order" ? "needs_review" : "draft"),
    ai_warnings: Array.isArray(body.ai_warnings) ? body.ai_warnings : [],
    owner_visible: Boolean(body.owner_visible) || creatorPersona === OWNER_PERSONA,
    status,
    created_by: user.id,
    ...buildClassificationPatch(body),
  };

  const { data, error } = await supabase
    .from("logbook_entries")
    .insert(insertPayload)
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
      logbook_type, mechanic_name, mechanic_cert_number, cert_type,
      target_logbook, source_type, source_id, source_context, source_references,
      signer_id, certificate_number, certificate_type, ia_flag, revision_number,
      supersedes_entry_id, entry_hash, pdf_hash, signature_reason, owner_visible,
      ai_review_status, ai_warnings, signature_certificate_id, signature_audit,
      parts_used, references_used, ad_numbers, work_order_ref,
      ata_code, jasc_code, classification_source, classification_confidence, classification_status,
      created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bundleInsert = {
    organization_id: orgId,
    logbook_entry_id: data.id,
    aircraft_id: data.aircraft_id,
    work_order_id: workOrder?.id ?? null,
    checklist_item_ids: checklistItems.map((item: any) => item.id).filter(Boolean),
    part_ids: workOrderLines.filter((line: any) => line.line_type === "part").map((line: any) => line.id).filter(Boolean),
    ad_sb_ids: adRefs,
    source_snapshot: {
      work_order: workOrder,
      lines: workOrderLines,
      checklist: checklistItems,
      generated_from: sourceType,
    },
  };
  const { error: bundleError } = await supabase
    .from("logbook_source_bundles")
    .upsert(bundleInsert, { onConflict: "logbook_entry_id" });
  if (bundleError) return NextResponse.json({ error: bundleError.message }, { status: 500 });

  await writeLogbookAudit(supabase, req, {
    organizationId: orgId,
    userId: user.id,
    action: "logbook_entry_created",
    entryId: data.id,
    aircraftId: data.aircraft_id,
    metadata: { source_type: sourceType, target_logbook: targetLogbook, work_order_id: workOrder?.id ?? null },
  });
  await writeLogbookTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: user.id,
    action: "created",
    entryId: data.id,
    title: "Logbook entry drafted",
    summary: `${targetLogbook} entry created${workOrder?.work_order_number ? ` from ${workOrder.work_order_number}` : ""}.`,
    ownerVisible: false,
    metadata: { source_type: sourceType, status },
  });

  return NextResponse.json(data, { status: 201 });
}
