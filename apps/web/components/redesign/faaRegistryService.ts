export interface FaaRegistrant {
  name: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  type?: string;
  region?: string;
  country?: string;
}

export interface FaaAircraftSpec {
  nNumber: string;
  serialNumber?: string;
  year?: number;
  manufacturer?: string;
  model?: string;
  aircraftType?: string;
  category?: string;
  seats?: number;
  maxWeight?: string;
  cruiseSpeed?: string;
}

export interface FaaEngineSpec {
  manufacturer?: string;
  model?: string;
  type?: string;
  horsepower?: number;
  tbo?: number;
}

export interface FaaCertificate {
  class?: string;
  issueDate?: string;
  expirationDate?: string;
  status?: string;
}

export type FaaLookupResult =
  | {
      found: true;
      source: "live" | "internal";
      aircraft: FaaAircraftSpec;
      engine: FaaEngineSpec;
      propeller?: string;
      registrant: FaaRegistrant;
      certificate: FaaCertificate;
    }
  | { found: false; source: "live" | "internal"; error?: string };

function normalizeTail(rawTail: string): string | null {
  const cleaned = rawTail.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.startsWith("N") ? cleaned : `N${cleaned}`;
  return normalized;
}

function mapLookupPayload(payload: any): FaaLookupResult {
  if (!payload || payload.error) {
    return { found: false, source: "live", error: payload?.error };
  }

  const aircraft = {
    nNumber: payload.tail_number ?? payload.nNumber ?? payload.tail ?? "",
    serialNumber: payload.serial_number ?? payload.serial ?? payload.serialNumber ?? "",
    year: payload.year ?? undefined,
    manufacturer: payload.make ?? payload.manufacturer ?? "",
    model: payload.model ?? "",
    aircraftType: payload.aircraft_type ?? payload.aircraftType ?? "",
    category: payload.aircraft_category ?? payload.category ?? "",
  } satisfies FaaAircraftSpec;

  const engine = {
    manufacturer: payload.engine_make ?? payload.engineManufacturer ?? "",
    model: payload.engine_model ?? payload.engineModel ?? "",
  } satisfies FaaEngineSpec;

  const registrant = {
    name: payload.registrant_name ?? payload.registrantName ?? "Unknown",
    city: payload.registrant_city ?? payload.registrantCity ?? "",
    state: payload.registrant_state ?? payload.registrantState ?? "",
    zip: payload.registrant_zip ?? payload.registrantZip ?? "",
    type: payload.registrant_type ?? payload.registrantType ?? "",
    country: payload.registrant_country ?? payload.registrantCountry ?? "",
  } satisfies FaaRegistrant;

  return {
    found: true,
    source: payload?.source === "internal_aircraft_profile" ? "internal" : "live",
    aircraft,
    engine,
    registrant,
    propeller: payload.propeller ?? undefined,
    certificate: payload.certificate ?? {},
  };
}

export async function lookupAircraftByNNumber(rawTail: string): Promise<FaaLookupResult> {
  const normalized = normalizeTail(rawTail);
  if (!normalized) {
    return { found: false, source: "live", error: "Invalid tail number" };
  }

  const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(normalized)}`);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    return {
      found: false,
      source: payload?.source === "internal_aircraft_profile" ? "internal" : "live",
      error: payload?.error ?? "Lookup failed",
    };
  }

  const payload = await res.json();
  return mapLookupPayload(payload);
}
