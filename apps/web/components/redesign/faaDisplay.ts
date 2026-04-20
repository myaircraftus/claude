import type { FaaCertificate, FaaEngineSpec, FaaRegistrant } from "./faaRegistryService";

export function formatRegistrantLocation(registrant?: FaaRegistrant | null): string {
  if (!registrant) return "Location unavailable";
  const parts = [
    registrant.city?.trim(),
    registrant.state?.trim(),
    registrant.country?.trim(),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Location unavailable";
}

export function formatRegistrantSummary(registrant?: FaaRegistrant | null): string {
  if (!registrant) return "Location unavailable";
  const location = formatRegistrantLocation(registrant);
  const detail = registrant.type?.trim();
  return detail ? `${location} · ${detail}` : location;
}

export function formatEngineLabel(engine?: FaaEngineSpec | null): string {
  if (!engine) return "Unavailable";
  const value = [engine.manufacturer?.trim(), engine.model?.trim()].filter(Boolean).join(" ");
  return value || "Unavailable";
}

export function formatHorsepower(engine?: FaaEngineSpec | null): string {
  const horsepower = Number(engine?.horsepower ?? 0);
  return horsepower > 0 ? `${horsepower} hp` : "N/A";
}

export function formatTbo(engine?: FaaEngineSpec | null): string {
  const tbo = Number(engine?.tbo ?? 0);
  return tbo > 0 ? `${tbo} hrs` : "See mfr data";
}

export function formatCertificateStatus(certificate?: FaaCertificate | null): string {
  return certificate?.status?.trim() || "Unavailable";
}

export function formatCertificateClass(certificate?: FaaCertificate | null): string {
  return certificate?.class?.trim() || "Unavailable";
}

export function isValidCertificate(certificate?: FaaCertificate | null): boolean {
  return formatCertificateStatus(certificate).toLowerCase() === "valid";
}
