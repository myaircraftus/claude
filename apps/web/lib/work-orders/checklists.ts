type AircraftChecklistContext = {
  tailNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engineMake?: string | null;
  engineModel?: string | null;
};

export type ChecklistTemplateOverrideItem = {
  section: string;
  label: string;
  description?: string | null;
  required?: boolean;
};

export type ChecklistTemplateOverride = {
  templateLabel?: string | null;
  sourceReference?: string | null;
  items: ChecklistTemplateOverrideItem[];
};

export type ChecklistTemplateOverrides = Record<string, ChecklistTemplateOverride>;

export type ChecklistTemplateReferenceAsset = {
  id: string;
  name: string;
  storagePath: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  note?: string | null;
};

export type ChecklistTemplateReferenceLibrary = {
  checklist: Record<string, ChecklistTemplateReferenceAsset[]>;
  logbook: ChecklistTemplateReferenceAsset[];
};

export type GeneratedChecklistItem = {
  templateKey: string;
  templateLabel: string;
  section: string;
  itemKey: string;
  itemLabel: string;
  itemDescription: string;
  source: string;
  sourceReference: string;
  required: boolean;
  sortOrder: number;
};

export type ChecklistTemplateResult = {
  templateKey: string;
  templateLabel: string;
  items: GeneratedChecklistItem[];
};

const CHECKLIST_TEMPLATE_KEY_ALIASES: Record<string, string> = {
  annual: "annual_inspection",
  annual_inspection: "annual_inspection",
  "100hr": "hundred_hour_inspection",
  "100_hour": "hundred_hour_inspection",
  "100-hour": "hundred_hour_inspection",
  hundred_hour: "hundred_hour_inspection",
  hundred_hour_inspection: "hundred_hour_inspection",
  oil: "oil_change",
  oil_change: "oil_change",
  brake: "brake_repair",
  brake_repair: "brake_repair",
  battery: "battery_elt",
  battery_elt: "battery_elt",
  battery_elt_service: "battery_elt",
  elt: "battery_elt",
  avionics: "avionics_installation",
  avionics_installation: "avionics_installation",
  avionics_service: "avionics_installation",
  electrical: "avionics_installation",
  ad: "ad_compliance",
  ad_compliance: "ad_compliance",
  tire: "tire_service",
  tire_service: "tire_service",
  tyre_service: "tire_service",
  general: "general_maintenance",
  maintenance: "general_maintenance",
  general_maintenance: "general_maintenance",
};

const CHECKLIST_TEMPLATE_LABELS: Record<string, string> = {
  annual_inspection: "Annual Inspection",
  hundred_hour_inspection: "100-Hour Inspection",
  oil_change: "Oil Change",
  brake_repair: "Brake Repair",
  battery_elt: "Battery / ELT",
  avionics_installation: "Avionics / Electrical",
  ad_compliance: "AD Compliance",
  tire_service: "Wheel / Tire Service",
  general_maintenance: "General Maintenance",
};

export function normalizeChecklistTemplateKey(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CHECKLIST_TEMPLATE_KEY_ALIASES[normalized] ?? null;
}

export function getChecklistTemplateLabel(templateKey?: string | null) {
  const normalized = normalizeChecklistTemplateKey(templateKey);
  if (!normalized) return "General Maintenance";
  return CHECKLIST_TEMPLATE_LABELS[normalized] ?? "General Maintenance";
}

export function createEmptyChecklistReferenceLibrary(): ChecklistTemplateReferenceLibrary {
  return {
    checklist: {},
    logbook: [],
  };
}

function isTemplateReferenceAsset(value: unknown): value is ChecklistTemplateReferenceAsset {
  if (!value || typeof value !== "object") return false;
  return typeof (value as ChecklistTemplateReferenceAsset).id === "string"
    && typeof (value as ChecklistTemplateReferenceAsset).name === "string"
    && typeof (value as ChecklistTemplateReferenceAsset).storagePath === "string";
}

export function extractChecklistTemplateReferenceLibrary(value: unknown): ChecklistTemplateReferenceLibrary {
  const empty = createEmptyChecklistReferenceLibrary();
  if (!value || typeof value !== "object") return empty;

  const meta = (value as Record<string, unknown>).__reference_assets;
  if (!meta || typeof meta !== "object") return empty;

  const checklistRaw =
    (meta as Record<string, unknown>).checklist && typeof (meta as Record<string, unknown>).checklist === "object"
      ? ((meta as Record<string, unknown>).checklist as Record<string, unknown>)
      : {};
  const logbookRaw = Array.isArray((meta as Record<string, unknown>).logbook)
    ? ((meta as Record<string, unknown>).logbook as unknown[])
    : [];

  const checklist = Object.entries(checklistRaw).reduce<Record<string, ChecklistTemplateReferenceAsset[]>>(
    (acc, [templateKey, assetList]) => {
      const normalizedTemplateKey = normalizeChecklistTemplateKey(templateKey);
      if (!normalizedTemplateKey) {
        return acc;
      }

      const items = Array.isArray(assetList) ? assetList.filter(isTemplateReferenceAsset) : [];
      if (items.length > 0) {
        acc[normalizedTemplateKey] = [...(acc[normalizedTemplateKey] ?? []), ...items];
      }
      return acc;
    },
    {}
  );

  return {
    checklist,
    logbook: logbookRaw.filter(isTemplateReferenceAsset),
  };
}

export function mergeChecklistTemplatesWithReferenceLibrary(
  templates: Record<string, unknown>,
  referenceLibrary: ChecklistTemplateReferenceLibrary
) {
  return {
    ...templates,
    __reference_assets: referenceLibrary,
  };
}

function resolveTemplateOverride(
  templateOverrides: ChecklistTemplateOverrides | null | undefined,
  templateKey: string
) {
  if (!templateOverrides) return undefined;
  const normalizedTemplateKey = normalizeChecklistTemplateKey(templateKey);
  if (!normalizedTemplateKey) return undefined;

  for (const [key, override] of Object.entries(templateOverrides)) {
    if (normalizeChecklistTemplateKey(key) === normalizedTemplateKey) {
      return override;
    }
  }

  return undefined;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function inferChecklistTemplateKey(
  serviceType?: string | null,
  complaint?: string | null,
  discrepancy?: string | null
) {
  const normalizedServiceType = normalizeChecklistTemplateKey(serviceType);
  if (normalizedServiceType) return normalizedServiceType;

  const haystack = [serviceType, complaint, discrepancy].map(normalizeText).join(" ");

  if (/annual/.test(haystack)) return "annual_inspection";
  if (/100.?hour|hundred.?hour/.test(haystack)) return "hundred_hour_inspection";
  if (/oil|filter/.test(haystack)) return "oil_change";
  if (/brake|caliper|disc|pad/.test(haystack)) return "brake_repair";
  if (/tire|tyre|wheel/.test(haystack)) return "tire_service";
  if (/elt|battery/.test(haystack)) return "battery_elt";
  if (/transponder|pitot|static|avionics|nav light|gps|comm/.test(haystack)) {
    return "avionics_installation";
  }
  if (/ad compliance|airworthiness directive|\bad\b/.test(haystack)) return "ad_compliance";
  return "general_maintenance";
}

function manufacturerReference(make?: string | null) {
  const normalized = normalizeText(make);
  if (normalized.includes("cessna")) return "Cessna service manual + FAA Part 43 Appendix D baseline";
  if (normalized.includes("piper")) return "Piper service manual + FAA Part 43 Appendix D baseline";
  if (normalized.includes("beech")) return "Beechcraft maintenance manual + FAA Part 43 Appendix D baseline";
  return "FAA Part 43 Appendix D baseline + shop standard return-to-service workflow";
}

function engineReference(engineMake?: string | null, engineModel?: string | null) {
  const parts = [engineMake, engineModel].map((value) => (value ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return `${parts.join(" ")} engine maintenance guidance`;
}

function buildSourceReference(
  aircraft: AircraftChecklistContext | null | undefined,
  referenceAssets?: ChecklistTemplateReferenceAsset[] | null,
  overrideSourceReference?: string | null,
) {
  if (overrideSourceReference?.trim()) return overrideSourceReference.trim();

  const uploadedReference = (referenceAssets ?? [])
    .map((asset) => asset.name.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  const manufacturer = manufacturerReference(aircraft?.make);
  const engine = engineReference(aircraft?.engineMake, aircraft?.engineModel);

  const fallbackSource = [manufacturer, engine].filter(Boolean).join(" + ");
  if (uploadedReference) {
    return fallbackSource
      ? `${uploadedReference} (shop reference) + ${fallbackSource}`
      : `${uploadedReference} (shop reference)`;
  }

  return fallbackSource;
}

function buildItems(
  templateKey: string,
  templateLabel: string,
  sourceReference: string,
  rows: Array<{ section: string; label: string; description: string; required?: boolean }>,
  source = "deterministic_template",
) {
  return rows.map((row, index) => ({
    templateKey,
    templateLabel,
    section: row.section,
    itemKey: `${templateKey}_${index + 1}`,
    itemLabel: row.label,
    itemDescription: row.description,
    source,
    sourceReference,
    required: row.required ?? true,
    sortOrder: index,
  }));
}

function generateChecklistByTemplateKey(params: {
  templateKey: string;
  aircraft?: AircraftChecklistContext | null;
  templateOverride?: ChecklistTemplateOverride | null;
  referenceAssets?: ChecklistTemplateReferenceAsset[] | null;
}): ChecklistTemplateResult {
  const { aircraft, templateOverride, referenceAssets } = params;
  const templateKey =
    normalizeChecklistTemplateKey(params.templateKey) ?? "general_maintenance";
  const sourceReference = buildSourceReference(
    aircraft,
    referenceAssets,
    templateOverride?.sourceReference
  );

  if (templateOverride?.items?.length) {
    return {
      templateKey,
      templateLabel: templateOverride.templateLabel?.trim() || getChecklistTemplateLabel(templateKey),
      items: buildItems(
        templateKey,
        templateOverride.templateLabel?.trim() || getChecklistTemplateLabel(templateKey),
        sourceReference || "Organization checklist template",
        templateOverride.items.map((item) => ({
          section: item.section,
          label: item.label,
          description: item.description?.trim() || "Follow approved shop procedure and document completion.",
          required: item.required ?? true,
        })),
        referenceAssets?.length ? "organization_template_reference" : "organization_template"
      ),
    };
  }

  if (templateKey === "annual_inspection") {
    return {
      templateKey,
      templateLabel: "Annual Inspection Checklist",
      items: buildItems(templateKey, "Annual Inspection Checklist", sourceReference, [
        { section: "Records", label: "Review maintenance records and prior discrepancies", description: "Confirm logbooks, prior signoffs, open squawks, and required inspection references before starting." },
        { section: "Airframe", label: "Inspect airframe structure and skins", description: "Inspect fuselage, control surfaces, hinges, attach points, corrosion areas, and evidence of damage." },
        { section: "Engine", label: "Inspect engine compartment and controls", description: "Inspect engine mount, baffles, controls, hoses, ignition leads, fuel and oil systems, and general condition." },
        { section: "Landing Gear", label: "Inspect landing gear, wheels, and brakes", description: "Inspect gear structure, tires, wheel bearings, discs, pads, calipers, and hydraulic lines." },
        { section: "Cabin", label: "Inspect cabin, belts, seats, and placards", description: "Confirm seats, restraints, required placards, controls, and cabin safety items are serviceable." },
        { section: "Systems", label: "Inspect electrical, lights, and avionics operation", description: "Verify switches, lights, radios, transponder, ELT status, and circuit protection." },
        { section: "Functional", label: "Perform operational checks and run-up", description: "Run engine as required, verify indications, and confirm all corrected discrepancies are functionally checked." },
        { section: "Signoff", label: "Complete discrepancy resolution and IA signoff package", description: "Confirm every discrepancy is resolved or documented and the aircraft is ready for return-to-service wording.", required: true },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "hundred_hour_inspection") {
    return {
      templateKey,
      templateLabel: "100-Hour Inspection Checklist",
      items: buildItems(templateKey, "100-Hour Inspection Checklist", sourceReference, [
        { section: "Records", label: "Verify time-in-service and due items", description: "Confirm tach/hobbs, due interval, and open maintenance items before inspection." },
        { section: "Airframe", label: "Inspect primary airframe items", description: "Inspect structure, flight controls, hinges, windows, doors, and general condition." },
        { section: "Powerplant", label: "Inspect engine, ignition, and fuel/oil systems", description: "Check plugs, ignition, hoses, filters, leaks, and engine controls." },
        { section: "Landing Gear", label: "Inspect gear, brakes, and tires", description: "Inspect tires, brakes, wheel bearings, struts, and steering components." },
        { section: "Operational", label: "Perform functional checks and run-up", description: "Verify corrected discrepancies and complete required operational checks before release." },
        { section: "Signoff", label: "Document 100-hour completion and aircraft status", description: "Update records and confirm the aircraft status prior to release." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "oil_change") {
    return {
      templateKey,
      templateLabel: "Oil Change Checklist",
      items: buildItems(templateKey, "Oil Change Checklist", sourceReference, [
        { section: "Preparation", label: "Verify approved oil/filter and engine time", description: "Confirm correct oil grade, filter part number, and current tach/hobbs before opening the system." },
        { section: "Service", label: "Drain oil and replace filter or screen", description: "Drain oil, replace filter/screen, inspect for contamination, and torque/secure components to spec." },
        { section: "Inspection", label: "Inspect filter/screen and engine bay for abnormalities", description: "Check for metal, leaks, damaged hoses, and any conditions requiring follow-up." },
        { section: "Return to Service", label: "Refill, run, leak-check, and record final time", description: "Refill with approved quantity, run engine, verify pressure, confirm no leaks, and capture final tach/hobbs." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "brake_repair") {
    return {
      templateKey,
      templateLabel: "Brake Service Checklist",
      items: buildItems(templateKey, "Brake Service Checklist", sourceReference, [
        { section: "Inspection", label: "Inspect discs, pads, calipers, and lines", description: "Inspect wear, heat damage, hydraulic condition, leaks, and component security." },
        { section: "Corrective Action", label: "Replace or service affected brake components", description: "Complete repair/replacement of the brake discrepancy using approved parts and procedures." },
        { section: "Operational", label: "Bleed/test brakes and verify pedal feel", description: "Bleed if required, verify pedal travel, braking response, and absence of leaks before release." },
        { section: "Records", label: "Document removed/installed parts and return-to-service notes", description: "Record part numbers, serials if applicable, and final functional check outcome." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "battery_elt") {
    return {
      templateKey,
      templateLabel: "Battery / ELT Checklist",
      items: buildItems(templateKey, "Battery / ELT Checklist", sourceReference, [
        { section: "Preparation", label: "Confirm battery eligibility and part details", description: "Verify correct replacement battery, expiration requirements, and equipment applicability." },
        { section: "Service", label: "Replace battery and inspect wiring/security", description: "Install the battery, inspect leads, connectors, mounts, and surrounding condition." },
        { section: "Operational", label: "Perform required operational test", description: "Run the operational test required for the installed equipment and confirm proper indication." },
        { section: "Records", label: "Update due date/expiration and maintenance records", description: "Record replacement date, next due or expiration, and final operational result." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "avionics_installation") {
    return {
      templateKey,
      templateLabel: "Avionics / Electrical Checklist",
      items: buildItems(templateKey, "Avionics / Electrical Checklist", sourceReference, [
        { section: "Troubleshooting", label: "Confirm discrepancy and isolate affected system", description: "Verify reported discrepancy, isolate the faulty unit/circuit, and inspect connectors, wiring, and protection." },
        { section: "Corrective Action", label: "Repair or replace failed component", description: "Complete the corrective action using approved data and verify installation quality." },
        { section: "Operational", label: "Perform post-maintenance operational check", description: "Verify the repaired system functions correctly and any related equipment passes operational checks." },
        { section: "Records", label: "Record configuration/part details and test results", description: "Document installed component details and the final test outcome before release." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "ad_compliance") {
    return {
      templateKey,
      templateLabel: "AD Compliance Checklist",
      items: buildItems(templateKey, "AD Compliance Checklist", sourceReference, [
        { section: "Research", label: "Verify applicable AD and affected serial range", description: "Confirm applicability against the aircraft/engine/propeller serial and installed configuration." },
        { section: "Compliance", label: "Perform required inspection, modification, or replacement", description: "Carry out the AD-mandated action using the referenced approved data." },
        { section: "Verification", label: "Confirm compliance method and recurrence status", description: "Verify one-time or recurring compliance status and any next-due requirement." },
        { section: "Records", label: "Record AD number, method, and next due", description: "Document the AD number, date/method of compliance, and recurring interval if applicable." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  if (templateKey === "tire_service") {
    return {
      templateKey,
      templateLabel: "Wheel / Tire Service Checklist",
      items: buildItems(templateKey, "Wheel / Tire Service Checklist", sourceReference, [
        { section: "Inspection", label: "Inspect wheel assembly, tire, and tube condition", description: "Confirm wear, cuts, damage, bead condition, and associated wheel/brake hardware status." },
        { section: "Service", label: "Replace or service tire assembly", description: "Complete removal and installation in accordance with approved maintenance practices." },
        { section: "Operational", label: "Inflate, torque, and verify taxi readiness", description: "Set pressure, torque hardware, and verify the aircraft is ready for service." },
      ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
    };
  }

  return {
    templateKey,
    templateLabel: "General Maintenance Checklist",
    items: buildItems(templateKey, "General Maintenance Checklist", sourceReference, [
      { section: "Review", label: "Confirm discrepancy and maintenance scope", description: "Review the reported discrepancy, aircraft configuration, and required references before starting work." },
      { section: "Corrective Action", label: "Perform repair or inspection per approved data", description: "Carry out the task using the appropriate maintenance instructions and shop workflow." },
      { section: "Verification", label: "Perform operational check and verify discrepancy is cleared", description: "Confirm the issue is corrected and any required functional check is complete." },
      { section: "Records", label: "Document work performed and return-to-service basis", description: "Capture final notes, parts/labor references, and return-to-service details before closing the work order." },
    ], referenceAssets?.length ? "uploaded_reference_fallback" : "deterministic_template"),
  };
}

export function generateChecklistTemplateDraft(params: {
  templateKey: string;
  aircraft?: AircraftChecklistContext | null;
  referenceAssets?: ChecklistTemplateReferenceAsset[] | null;
}) {
  return generateChecklistByTemplateKey({
    templateKey: params.templateKey,
    aircraft: params.aircraft,
    referenceAssets: params.referenceAssets,
  }).items.map((item) => item.itemLabel);
}

export function generateWorkOrderChecklist(params: {
  serviceType?: string | null;
  complaint?: string | null;
  discrepancy?: string | null;
  aircraft?: AircraftChecklistContext | null;
  templateOverrides?: ChecklistTemplateOverrides | null;
  templateReferenceLibrary?: ChecklistTemplateReferenceLibrary | null;
}): ChecklistTemplateResult {
  const templateKey = inferChecklistTemplateKey(
    params.serviceType,
    params.complaint,
    params.discrepancy
  );
  const templateOverride = resolveTemplateOverride(params.templateOverrides, templateKey);
  const templateAssets = params.templateReferenceLibrary?.checklist?.[templateKey] ?? [];

  return generateChecklistByTemplateKey({
    templateKey,
    aircraft: params.aircraft,
    templateOverride,
    referenceAssets: templateAssets,
  });
}
