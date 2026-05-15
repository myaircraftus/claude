import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";
import { buildClassificationPatch } from "@/lib/taxonomy/format";
import {
  VALID_ENTRY_TYPES,
  VALID_STATUSES,
  VALID_LOGBOOK_TYPES,
} from "@/lib/logbook/constants";
import {
  buildLogbookHash,
  canEditLogbookStatus,
  normalizeEntryType,
  normalizeLogbookStatus,
  normalizeLogbookType,
  normalizeTargetLogbook,
  writeLogbookAudit,
  writeLogbookTimeline,
} from "@/lib/logbook/workflow";

const ENTRY_SELECT = `
  id, aircraft_id, work_order_id, entry_type, entry_date, description,
  total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
  logbook_type, mechanic_name, mechanic_cert_number, cert_type,
  target_logbook, source_type, source_id, source_context, source_references,
  signer_id, certificate_number, certificate_type, ia_flag, revision_number,
  supersedes_entry_id, entry_hash, pdf_hash, signature_reason, owner_visible,
  ai_review_status, ai_warnings, signature_certificate_id, signature_audit,
  parts_used, references_used, ad_numbers, work_order_ref,
  ata_code, jasc_code, classification_source, classification_confidence, classification_status,
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

  // Load current entry to check status and support immutable signed revisions.
  const { data: existing, error: fetchErr } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const createRevision = Boolean(body.create_revision);
  if (!canEditLogbookStatus(existing.status) && !createRevision) {
    return NextResponse.json(
      { error: `Cannot edit entry with status '${existing.status}' without creating a new revision` },
      { status: 409 }
    );
  }
  if (!canEditLogbookStatus(existing.status) && createRevision && !body.revision_reason) {
    return NextResponse.json(
      { error: "revision_reason is required when revising a signed or published logbook entry" },
      { status: 400 }
    );
  }

  // Validate enums if provided
  if (body.entry_type !== undefined) {
    const normalized = String(body.entry_type).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!VALID_ENTRY_TYPES.includes(normalized as any)) {
      return NextResponse.json(
        { error: `Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
  }
  if (body.status !== undefined) {
    const normalized = String(body.status).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!VALID_STATUSES.includes(normalized as any)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
  }
  if (body.logbook_type !== undefined && body.logbook_type !== null
      && !normalizeLogbookType(body.logbook_type)) {
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
    "target_logbook",
    "source_type",
    "source_id",
    "source_context",
    "source_references",
    "mechanic_name",
    "mechanic_cert_number",
    "cert_type",
    "certificate_number",
    "certificate_type",
    "ia_flag",
    "signature_reason",
    "ai_review_status",
    "ai_warnings",
    "owner_visible",
    "status",
    "work_order_id",
    "ata_code",
    "jasc_code",
    "classification_source",
    "classification_confidence",
    "classification_status",
  ] as const;

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (body[key] !== undefined) updatePayload[key] = body[key];
  }
  if (body.entry_type !== undefined) updatePayload.entry_type = normalizeEntryType(body.entry_type);
  if (body.status !== undefined) {
    updatePayload.status = normalizeLogbookStatus(body.status);
    if (updatePayload.status === "ready_for_review") updatePayload.ready_for_review_at = updatePayload.updated_at;
    if (updatePayload.status === "ready_to_sign") updatePayload.ready_to_sign_at = updatePayload.updated_at;
    if (updatePayload.status === "printed_unsigned") updatePayload.printed_unsigned_at = updatePayload.updated_at;
    if (updatePayload.status === "published_to_owner") updatePayload.published_to_owner_at = updatePayload.updated_at;
    if (updatePayload.status === "voided" || updatePayload.status === "voided_with_reason") updatePayload.voided_at = updatePayload.updated_at;
  }
  if (body.logbook_type !== undefined) updatePayload.logbook_type = normalizeLogbookType(body.logbook_type);
  if (body.target_logbook !== undefined) updatePayload.target_logbook = normalizeTargetLogbook(body.target_logbook);
  Object.assign(updatePayload, buildClassificationPatch(body));

  if (createRevision && !canEditLogbookStatus(existing.status)) {
    const nextRevisionNumber = Number(existing.revision_number ?? existing.version ?? 1) + 1;
    const snapshot = {
      previous: existing,
      patch: updatePayload,
      reason: body.revision_reason,
    };
    const entryHash = buildLogbookHash(snapshot);
    const insertPayload = {
      ...existing,
      ...updatePayload,
      id: undefined,
      status: normalizeLogbookStatus(body.status ?? "draft"),
      revision_number: nextRevisionNumber,
      version: nextRevisionNumber,
      supersedes_entry_id: existing.id,
      previous_revision_hash: existing.entry_hash ?? null,
      entry_hash: null,
      pdf_hash: null,
      signature_certificate_id: null,
      signature_audit: {},
      signed_at: null,
      signed_by: null,
      signer_id: null,
      created_by: ctx.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    delete insertPayload.id;

    const { data: revision, error: revisionError } = await supabase
      .from("logbook_entries")
      .insert(insertPayload)
      .select(ENTRY_SELECT)
      .single();
    if (revisionError) return NextResponse.json({ error: revisionError.message }, { status: 500 });

    await supabase
      .from("logbook_entries")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("organization_id", orgId);

    await supabase.from("logbook_entry_revisions").insert({
      organization_id: orgId,
      logbook_entry_id: revision.id,
      revision_number: nextRevisionNumber,
      previous_entry_hash: existing.entry_hash ?? null,
      entry_hash: entryHash,
      snapshot,
      reason: body.revision_reason,
      created_by: ctx.user.id,
    });
    await writeLogbookAudit(supabase, req, {
      organizationId: orgId,
      userId: ctx.user.id,
      action: "logbook_entry_revision_created",
      entryId: revision.id,
      aircraftId: revision.aircraft_id,
      metadata: { supersedes_entry_id: existing.id, reason: body.revision_reason },
    });
    await writeLogbookTimeline(supabase, {
      organizationId: orgId,
      aircraftId: revision.aircraft_id,
      actorId: ctx.user.id,
      action: "revised",
      entryId: revision.id,
      title: "Logbook entry revision created",
      summary: body.revision_reason,
      ownerVisible: false,
      metadata: { supersedes_entry_id: existing.id },
    });

    return NextResponse.json(revision, { status: 201 });
  }

  const { data, error } = await supabase
    .from("logbook_entries")
    .update(updatePayload)
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .select(ENTRY_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (["printed_unsigned", "published_to_owner"].includes(String(updatePayload.status))) {
    const action = updatePayload.status === "printed_unsigned" ? "print_unsigned" : "publish_owner";
    await supabase.from("logbook_output_events").insert({
      organization_id: orgId,
      logbook_entry_id: data.id,
      aircraft_id: data.aircraft_id,
      action,
      channel: action === "print_unsigned" ? "print" : "owner_portal",
      actor_id: ctx.user.id,
      metadata: { status: updatePayload.status },
    });
  }

  await writeLogbookAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: "logbook_entry_updated",
    entryId: data.id,
    aircraftId: data.aircraft_id,
    metadata: { status: data.status },
  });
  await writeLogbookTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: ctx.user.id,
    action: "updated",
    entryId: data.id,
    title: "Logbook entry updated",
    summary: data.status ? `Status: ${data.status}` : null,
    ownerVisible: Boolean(data.owner_visible),
    metadata: { status: data.status },
  });

  return NextResponse.json(data);
}
