"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";

export interface CreateAircraftPayload {
  tail_number: string;
  make: string;
  model: string;
  year?: number;
  serial_number?: string;
  engine_make?: string;
  engine_model?: string;
  base_airport?: string;
  operator_name?: string;
  operation_types?: string[];
  notes?: string;
}

async function resolveOrganizationId() {
  const orgRes = await fetch("/api/organization", { cache: "no-store" });
  const orgPayload = await orgRes.json().catch(() => null);
  if (orgRes.ok && orgPayload?.organization_id) {
    return orgPayload.organization_id as string;
  }

  const supabase = createBrowserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You need to be signed in to add an aircraft.");
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .single();

  if (error || !data?.organization_id) {
    throw new Error("Unable to determine your organization.");
  }

  return data.organization_id as string;
}

export async function createAircraftRecord(payload: CreateAircraftPayload) {
  const organization_id = await resolveOrganizationId();
  const res = await fetch("/api/aircraft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organization_id,
      ...payload,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fieldErrors = data?.details?.fieldErrors as Record<string, string[] | undefined> | undefined;
    const firstFieldMessage = fieldErrors
      ? Object.values(fieldErrors).flat().find(Boolean)
      : undefined;

    throw new Error(firstFieldMessage ?? data?.error ?? `Failed to create aircraft (HTTP ${res.status})`);
  }

  return data;
}
