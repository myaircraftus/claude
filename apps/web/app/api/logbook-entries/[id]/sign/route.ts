import { NextRequest, NextResponse } from "next/server";
import { resolveRequestOrgContext } from "@/lib/auth/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { MECHANIC_AND_ABOVE } from "@/lib/roles";
import {
  buildLogbookHash,
  canSignLogbookStatus,
  requestIp,
  writeLogbookAudit,
  writeLogbookTimeline,
} from "@/lib/logbook/workflow";

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
    ia_flag?: boolean;
    timezone?: string;
    mfa_event_id?: string;
    signature_reason?: string;
    confirm_missing_time?: boolean;
    signature_audit?: Record<string, any>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mechanicName = (body.mechanic_name ?? "").trim();
  const certificateNumber = (body.mechanic_cert_number ?? "").trim();
  const certificateType = body.cert_type;
  const signatureReason = (body.signature_reason ?? "Return to service").trim();

  if (!mechanicName) {
    return NextResponse.json({ error: "mechanic_name is required" }, { status: 400 });
  }
  if (!certificateNumber) {
    return NextResponse.json({ error: "mechanic_cert_number is required" }, { status: 400 });
  }
  if (!certificateType || !VALID_CERT_TYPES.includes(certificateType)) {
    return NextResponse.json(
      { error: `cert_type must be one of: ${VALID_CERT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canSignLogbookStatus(existing.status)) {
    return NextResponse.json(
      { error: `Cannot sign entry with status '${existing.status}'` },
      { status: 409 }
    );
  }

  const missingOfficialTime = existing.total_time == null && existing.tach_time == null;
  if (missingOfficialTime && !body.confirm_missing_time) {
    return NextResponse.json(
      {
        error: "Missing tach or total time. Confirm missing time before signing.",
        code: "MISSING_TIME_CONFIRMATION_REQUIRED",
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const entryHash = buildLogbookHash({
    id: existing.id,
    aircraft_id: existing.aircraft_id,
    target_logbook: existing.target_logbook ?? existing.logbook_type,
    entry_type: existing.entry_type,
    entry_date: existing.entry_date,
    tach_time: existing.tach_time,
    total_time: existing.total_time,
    hobbs_in: existing.hobbs_in,
    hobbs_out: existing.hobbs_out,
    description: existing.description,
    parts_used: existing.parts_used,
    references_used: existing.references_used,
    ad_numbers: existing.ad_numbers,
    signer: {
      user_id: user.id,
      name: mechanicName,
      certificate_number: certificateNumber,
      certificate_type: certificateType,
      ia_flag: Boolean(body.ia_flag || certificateType === "IA"),
    },
  });
  const pdfHash = buildLogbookHash({ entryHash, rendered_at: nowIso, output: "signed_pdf_projection" });
  const signatureAudit = {
    ...(body.signature_audit ?? {}),
    signer_user_id: user.id,
    signer_name: mechanicName,
    certificate_number: certificateNumber,
    certificate_type: certificateType,
    ia_flag: Boolean(body.ia_flag || certificateType === "IA"),
    timestamp: nowIso,
    timezone: body.timezone ?? "UTC",
    ip_address: requestIp(req),
    device_metadata: {
      user_agent: req.headers.get("user-agent"),
      ...(body.signature_audit?.device_metadata ?? {}),
    },
    mfa_event_id: body.mfa_event_id ?? null,
    signature_reason: signatureReason,
    entry_hash: entryHash,
    pdf_hash: pdfHash,
    previous_revision_hash: existing.previous_revision_hash ?? null,
    no_browser_mac_address: true,
  };

  const { data: cert, error: certError } = await supabase
    .from("signature_certificates")
    .insert({
      organization_id: orgId,
      document_type: "logbook_entry",
      document_id: existing.id,
      logbook_entry_id: existing.id,
      document_hash: entryHash,
      document_version: existing.revision_number ?? existing.version ?? 1,
      signer_id: user.id,
      signer_user_id: user.id,
      signer_name: mechanicName,
      signer_certificate_number: certificateNumber,
      signer_role: certificateType,
      certificate_number: certificateNumber,
      certificate_type: certificateType,
      ia_flag: Boolean(body.ia_flag || certificateType === "IA"),
      signature_data: body.signature_audit?.signature_data ?? body.signature_audit?.signatureData ?? mechanicName,
      signature_type: body.signature_audit?.signature_type === "drawn" ? "drawn" : "typed",
      consent_statement: "I certify this logbook entry and accept responsibility for the final signed wording.",
      consent_accepted_at: nowIso,
      signed_at: nowIso,
      timezone: body.timezone ?? "UTC",
      ip_address: requestIp(req),
      session_id: body.signature_audit?.session_id ?? null,
      device_metadata: signatureAudit.device_metadata,
      mfa_event_id: body.mfa_event_id ?? null,
      signature_reason: signatureReason,
      entry_hash: entryHash,
      pdf_hash: pdfHash,
      previous_revision_hash: existing.previous_revision_hash ?? null,
      source_references: existing.source_references ?? {},
    })
    .select("*")
    .single();

  if (certError) return NextResponse.json({ error: certError.message }, { status: 500 });

  const { data, error } = await supabase
    .from("logbook_entries")
    .update({
      status: "signed",
      // Signing publishes the entry to the owner — wire the visibility gate.
      owner_visible: true,
      published_to_owner_at: nowIso,
      signed_at: nowIso,
      signed_by: user.id,
      signer_id: user.id,
      mechanic_name: mechanicName,
      mechanic_cert_number: certificateNumber,
      cert_type: certificateType,
      certificate_number: certificateNumber,
      certificate_type: certificateType,
      ia_flag: Boolean(body.ia_flag || certificateType === "IA"),
      signature_reason: signatureReason,
      signature_audit: signatureAudit,
      signature_certificate_id: cert.id,
      entry_hash: entryHash,
      pdf_hash: pdfHash,
      updated_at: nowIso,
    })
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .select(`
      id, aircraft_id, work_order_id, entry_type, entry_date, description,
      total_time, hobbs_in, hobbs_out, tach_time, status, signed_at, signed_by,
      logbook_type, target_logbook, mechanic_name, mechanic_cert_number, cert_type,
      signer_id, certificate_number, certificate_type, ia_flag, signature_reason,
      signature_certificate_id, signature_audit, entry_hash, pdf_hash,
      parts_used, references_used, ad_numbers, work_order_ref,
      source_type, source_id, source_references, revision_number,
      created_at, updated_at
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("logbook_entry_revisions").insert({
    organization_id: orgId,
    logbook_entry_id: data.id,
    revision_number: data.revision_number ?? 1,
    previous_entry_hash: existing.previous_revision_hash ?? null,
    entry_hash: entryHash,
    snapshot: { signed_entry: data, signature_certificate: cert },
    reason: signatureReason,
    created_by: user.id,
  });

  await writeLogbookAudit(supabase, req, {
    organizationId: orgId,
    userId: user.id,
    action: "logbook_entry_signed",
    entryId: data.id,
    aircraftId: data.aircraft_id,
    metadata: {
      signature_certificate_id: cert.id,
      certificate_type: certificateType,
      entry_hash: entryHash,
      pdf_hash: pdfHash,
      mfa_event_id: body.mfa_event_id ?? null,
    },
  });
  await writeLogbookTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: user.id,
    action: "signed",
    entryId: data.id,
    title: "Logbook entry signed",
    summary: `${mechanicName} signed ${data.target_logbook ?? data.logbook_type ?? "logbook"} entry.`,
    ownerVisible: false,
    metadata: { signature_certificate_id: cert.id, certificate_type: certificateType },
  });

  return NextResponse.json({ ...data, signature_certificate: cert });
}
