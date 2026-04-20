import { describe, expect, it } from "vitest";
import {
  extractChecklistTemplateReferenceLibrary,
  generateWorkOrderChecklist,
  normalizeChecklistTemplateKey,
} from "@/lib/work-orders/checklists";

describe("checklist template normalization", () => {
  it("maps legacy aliases to canonical template keys", () => {
    expect(normalizeChecklistTemplateKey("battery_elt_service")).toBe("battery_elt");
    expect(normalizeChecklistTemplateKey("avionics_service")).toBe("avionics_installation");
    expect(normalizeChecklistTemplateKey("100hr")).toBe("hundred_hour_inspection");
  });

  it("merges legacy reference-library keys into canonical buckets", () => {
    const library = extractChecklistTemplateReferenceLibrary({
      __reference_assets: {
        checklist: {
          battery_elt_service: [
            { id: "a", name: "Legacy battery ref", storagePath: "legacy.pdf" },
          ],
          battery_elt: [
            { id: "b", name: "Canonical battery ref", storagePath: "canonical.pdf" },
          ],
        },
        logbook: [],
      },
    });

    expect(library.checklist.battery_elt).toEqual([
      { id: "a", name: "Legacy battery ref", storagePath: "legacy.pdf" },
      { id: "b", name: "Canonical battery ref", storagePath: "canonical.pdf" },
    ]);
  });

  it("applies legacy template overrides to canonical work-order checklist generation", () => {
    const checklist = generateWorkOrderChecklist({
      serviceType: "transponder inspection",
      templateOverrides: {
        avionics_service: {
          templateLabel: "Legacy Avionics Template",
          sourceReference: "Legacy shop binder",
          items: [
            {
              section: "Ops Check",
              label: "Run transponder functional test",
              description: "Verify mode A/C output and document results.",
              required: true,
            },
          ],
        },
      },
    });

    expect(checklist.templateKey).toBe("avionics_installation");
    expect(checklist.templateLabel).toBe("Legacy Avionics Template");
    expect(checklist.items[0]?.sourceReference).toBe("Legacy shop binder");
    expect(checklist.items[0]?.itemLabel).toBe("Run transponder functional test");
  });
});
