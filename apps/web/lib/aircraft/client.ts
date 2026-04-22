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
  owner_customer_id?: string | null;
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
    const error = new Error(firstFieldMessage ?? data?.error ?? `Failed to create aircraft (HTTP ${res.status})`) as Error & {
      code?: string;
      current_customer?: unknown;
      existing_aircraft_id?: string;
      can_transfer?: boolean;
      can_hide_from_customer?: boolean;
    };
    error.code = data?.code;
    error.current_customer = data?.current_customer;
    error.existing_aircraft_id = data?.existing_aircraft_id;
    error.can_transfer = data?.can_transfer;
    error.can_hide_from_customer = data?.can_hide_from_customer;
    throw error;
  }

  return data;
}
