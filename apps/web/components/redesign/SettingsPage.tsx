"use client";

import { useEffect, useRef, useState } from "react";
import {
  User, Building2, Shield, CreditCard, Bell, Users, Mail, Phone, Plane,
  X, ChevronDown, Check, RotateCcw, Lock, Plus, Search, ExternalLink,
  CheckCircle, DollarSign, Edit3, Send, Wrench, HardHat, ClipboardList, FileText,
  Eye, AlertTriangle, Briefcase, Zap, Upload, Trash2, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppContext } from "./AppContext";
import { ROLE_DEFAULTS } from "./AppContext";
import type { TeamMember, TeamMemberRole, MechanicPermissions, LicenseType } from "./AppContext";
import { useDataStore, type Customer } from "./workspace/DataStore";
import { UsersPage } from "./UsersPage";
import { IntegrationsPage } from "./IntegrationsPage";
import { ApiSettingsPage } from "./ApiSettingsPage";
import { MyAircraftLogo } from "./MyAircraftLogo";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatBytes } from "@/lib/utils";
import {
  createEmptyChecklistReferenceLibrary,
  extractChecklistTemplateReferenceLibrary,
  generateChecklistTemplateDraft,
  normalizeChecklistTemplateKey,
  mergeChecklistTemplatesWithReferenceLibrary,
  type ChecklistTemplateReferenceAsset,
  type ChecklistTemplateReferenceLibrary,
} from "@/lib/work-orders/checklists";

type OrganizationChecklistTemplateDraft = Record<string, string>;

const CHECKLIST_TEMPLATE_FIELDS = [
  { key: "annual_inspection", label: "Annual Inspection" },
  { key: "hundred_hour_inspection", label: "100-Hour Inspection" },
  { key: "oil_change", label: "Oil Change" },
  { key: "brake_repair", label: "Brake Repair" },
  { key: "battery_elt", label: "Battery / ELT" },
  { key: "avionics_installation", label: "Avionics" },
  { key: "ad_compliance", label: "AD Compliance" },
  { key: "tire_service", label: "Tire Service" },
  { key: "general_maintenance", label: "General Maintenance" },
] as const;

function createEmptyChecklistDrafts(): OrganizationChecklistTemplateDraft {
  return CHECKLIST_TEMPLATE_FIELDS.reduce<OrganizationChecklistTemplateDraft>((acc, field) => {
    acc[field.key] = "";
    return acc;
  }, {});
}

function buildChecklistTemplateSourceReference(
  assets: ChecklistTemplateReferenceAsset[] | undefined,
  organizationName: string
) {
  const uploadedNames = (assets ?? [])
    .map((asset) => asset.name.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  if (uploadedNames) {
    return `${organizationName || "Organization"} template • refs: ${uploadedNames}`;
  }

  return `${organizationName || "Organization"} template`;
}

function checklistTemplatesToDrafts(value: unknown): OrganizationChecklistTemplateDraft {
  const drafts = createEmptyChecklistDrafts();
  if (!value || typeof value !== "object") return drafts;

  const templates = value as Record<string, any>;

  for (const field of CHECKLIST_TEMPLATE_FIELDS) {
    const template = Object.entries(templates).find(
      ([key]) => normalizeChecklistTemplateKey(key) === field.key
    )?.[1];
    const items = Array.isArray(template?.items) ? template.items : [];
    drafts[field.key] = items
      .map((item: any) => String(item?.label ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }

  return drafts;
}

function draftsToChecklistTemplates(
  drafts: OrganizationChecklistTemplateDraft,
  organizationName: string,
  referenceLibrary: ChecklistTemplateReferenceLibrary
) {
  const result: Record<string, unknown> = {};

  for (const field of CHECKLIST_TEMPLATE_FIELDS) {
    const lines = String(drafts[field.key] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    result[field.key] = {
      label: field.label,
      items: lines.map((line, index) => ({
        label: line,
        required: true,
        sort_order: index,
        section: "Shop Checklist",
        sourceReference: buildChecklistTemplateSourceReference(
          referenceLibrary.checklist[field.key],
          organizationName
        ),
      })),
    };
  }

  return result;
}

function formatTemplateUploadDate(value?: string | null) {
  if (!value) return "Added to source library";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Added to source library";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Settings tab sets — persona-aware ──────────────────────── */
// Owner persona: "Users" = aircraft users / pilots / admins (no mechanic Team)
const OWNER_TABS = [
  { icon: User,       label: "Profile" },
  { icon: Building2,  label: "Organization" },
  { icon: Users,      label: "Users" },
  { icon: Users,      label: "Customers" },
  { icon: Shield,     label: "Security" },
  { icon: CreditCard, label: "Billing" },
  { icon: Bell,       label: "Notifications" },
  { icon: Zap,        label: "Integrations" },
  { icon: Lock,       label: "API" },
];

// Mechanic persona (full access): "Team" = shop mechanics (no owner Users)
const ALL_TABS = [
  { icon: User,       label: "Profile" },
  { icon: Building2,  label: "Organization" },
  { icon: Users,      label: "Team" },
  { icon: Users,      label: "Customers" },
  { icon: Shield,     label: "Security" },
  { icon: CreditCard, label: "Billing" },
  { icon: Bell,       label: "Notifications" },
  { icon: Zap,        label: "Integrations" },
  { icon: Lock,       label: "API" },
];

const RESTRICTED_TABS = [
  { icon: User, label: "Profile" },
  { icon: Bell, label: "Notifications" },
];

/* ─── Permission labels & groups ─────────────────────────────── */
const PERM_GROUPS: { label: string; items: { key: keyof MechanicPermissions; label: string; desc: string }[] }[] = [
  {
    label: "Navigation & Sidebar Access",
    items: [
      { key: "aiCommandCenter", label: "AI Command Center",  desc: "Full AI chat workspace with invoice, estimate & customer actions" },
      { key: "dashboard",       label: "Dashboard",          desc: "Overview metrics and activity feed" },
      { key: "aircraft",        label: "Aircraft",           desc: "Assigned fleet list and cockpit detail views" },
      { key: "squawks",         label: "Squawks",            desc: "Squawk queue — view, add, and triage defects" },
      { key: "estimates",       label: "Estimates",          desc: "Create, send, and track customer estimates" },
      { key: "workOrders",      label: "Work Orders",        desc: "Active work order list and detail hub" },
      { key: "invoices",        label: "Invoices",           desc: "Invoice management, drafts, and payment tracking" },
      { key: "logbook",         label: "Logbook",            desc: "View and generate maintenance logbook entries" },
    ],
  },
  {
    label: "Work Order Detail — Tab Access",
    items: [
      { key: "woLineItems",  label: "Line Items",        desc: "View and edit labor + parts billing lines" },
      { key: "woOwnersView", label: "Owner View",        desc: "Customer-facing progress summary and update panel" },
      { key: "woInvoice",    label: "Invoice Tab",       desc: "Generate and review the invoice from a work order" },
      { key: "woCloseWO",    label: "Close Work Order",  desc: "Ability to close a work order and finalize logbook entry" },
    ],
  },
  {
    label: "Settings Access",
    items: [
      { key: "settingsFull", label: "Full Settings", desc: "Access to Team, Billing, Org, and Customers tabs (otherwise Profile + Notifications only)" },
    ],
  },
];

const ROLES: TeamMemberRole[] = ["Lead Mechanic / IA", "Mechanic", "Apprentice Mechanic", "Read Only"];

const ROLE_COLORS: Record<TeamMemberRole, string> = {
  "Lead Mechanic / IA":  "bg-blue-100 text-blue-700",
  "Mechanic":            "bg-violet-100 text-violet-700",
  "Apprentice Mechanic": "bg-slate-100 text-slate-600",
  "Read Only":           "bg-amber-50 text-amber-700",
};

const ROLE_ICON_MAP: Record<string, any> = {
  "Lead Mechanic / IA": HardHat,
  "Mechanic": Wrench,
  "Apprentice Mechanic": ClipboardList,
  "Read Only": Eye,
};

const ROLE_DESC: Record<string, string> = {
  "Lead Mechanic / IA": "Full access — AI Command, all sections, logbook sign-off & close WOs",
  "Mechanic": "Work Orders — log labor and parts, limited settings",
  "Apprentice Mechanic": "Work Orders view only — no billing or settings",
  "Read Only": "Logbook view only — no edits or work order access",
};

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                       */
/* ═══════════════════════════════════════════════════════════════ */
export function SettingsPage() {
  const { persona, team, activeMechanic, updateMember, addTeamMember, removeTeamMember } = useAppContext();
  const { customers } = useDataStore();

  const isRestrictedMechanic = persona === "mechanic" && !activeMechanic.permissions.settingsFull;
  const isLeadMechanic = persona === "mechanic" && activeMechanic.role === "Lead Mechanic / IA";

  // Owner → OWNER_TABS (has "Users", no "Team")
  // Mechanic full → ALL_TABS (has "Team", no "Users")
  // Mechanic restricted → RESTRICTED_TABS
  const tabs = isRestrictedMechanic
    ? RESTRICTED_TABS
    : persona === "owner"
    ? OWNER_TABS
    : ALL_TABS;

  const [activeTab, setActiveTab] = useState(tabs[0].label);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Profile
  const [profileName, setProfileName] = useState(activeMechanic.name);
  const [profileEmail, setProfileEmail] = useState(activeMechanic.email);
  const [profileRate, setProfileRate] = useState(String(activeMechanic.rate ?? 0));
  const [profileLicenseType, setProfileLicenseType] = useState<LicenseType>(activeMechanic.licenseType ?? "A&P Mechanic");
  const [profileLicenseNumber, setProfileLicenseNumber] = useState(activeMechanic.licenseNumber ?? "");
  const [profileSaved, setProfileSaved] = useState(false);

  // Owner profile (fetched from /api/me)
  const [ownerProfileName, setOwnerProfileName] = useState("");
  const [ownerProfileEmail, setOwnerProfileEmail] = useState("");
  const [ownerProfileJobTitle, setOwnerProfileJobTitle] = useState("");
  const [ownerProfileAvatarUrl, setOwnerProfileAvatarUrl] = useState<string | null>(null);
  const [ownerProfileHandle, setOwnerProfileHandle] = useState("");
  const [ownerProfilePersona, setOwnerProfilePersona] = useState<string | null>(null);
  const [ownerProfileLoading, setOwnerProfileLoading] = useState(false);
  const [ownerProfileSaving, setOwnerProfileSaving] = useState(false);
  const [ownerProfileSaved, setOwnerProfileSaved] = useState(false);
  const [ownerProfileError, setOwnerProfileError] = useState<string | null>(null);
  const [handleStatus, setHandleStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "available"; handle: string }
    | { kind: "unavailable"; message: string }
  >({ kind: "idle" });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Modals
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Inline rate edit
  const [editingRateMemberId, setEditingRateMemberId] = useState<string | null>(null);
  const [rateInputValue, setRateInputValue] = useState("");
  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    logoUrl: "",
    businessEmail: "",
    businessPhone: "",
    websiteUrl: "",
    companyAddress: "",
    invoiceFooter: "",
    estimateTerms: "",
    workOrderTerms: "",
  });
  const [checklistDrafts, setChecklistDrafts] = useState<OrganizationChecklistTemplateDraft>(
    createEmptyChecklistDrafts()
  );
  const [referenceLibrary, setReferenceLibrary] = useState<ChecklistTemplateReferenceLibrary>(
    createEmptyChecklistReferenceLibrary()
  );
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationSaved, setOrganizationSaved] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [templateUploadTarget, setTemplateUploadTarget] = useState<string | null>(null);
  const [logbookUploadPending, setLogbookUploadPending] = useState(false);
  const [generatorHints, setGeneratorHints] = useState({
    makeModel: "",
    engineType: "",
  });
  const checklistInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const logbookInputRef = useRef<HTMLInputElement | null>(null);

  const validTab = tabs.find((t) => t.label === activeTab) ? activeTab : tabs[0].label;

  useEffect(() => {
    if (persona === "mechanic") return;

    let cancelled = false;

    async function loadOwnerProfile() {
      setOwnerProfileLoading(true);
      setOwnerProfileError(null);
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error ?? `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setOwnerProfileName(payload?.profile?.full_name ?? "");
        setOwnerProfileEmail(payload?.profile?.email ?? payload?.user?.email ?? "");
        setOwnerProfileJobTitle(payload?.profile?.job_title ?? "");
        setOwnerProfileAvatarUrl(payload?.profile?.avatar_url ?? null);
        setOwnerProfileHandle(payload?.profile?.handle ?? "");
        setOwnerProfilePersona(payload?.profile?.persona ?? null);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load profile", error);
          setOwnerProfileError(
            error instanceof Error ? error.message : "Failed to load profile."
          );
        }
      } finally {
        if (!cancelled) setOwnerProfileLoading(false);
      }
    }

    loadOwnerProfile();

    return () => {
      cancelled = true;
    };
  }, [persona]);

  useEffect(() => {
    const trimmed = ownerProfileHandle.trim().toLowerCase();
    if (!trimmed || trimmed === (ownerProfileHandle && handleStatus.kind === "idle" ? ownerProfileHandle.toLowerCase() : "")) {
      // idle when empty or equal to current persisted
    }
    if (!trimmed) { setHandleStatus({ kind: "idle" }); return; }
    setHandleStatus({ kind: "checking" });
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/me/handle-available?handle=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);
        if (!payload) return;
        if (payload.available) {
          setHandleStatus({ kind: "available", handle: payload.handle });
        } else {
          setHandleStatus({
            kind: "unavailable",
            message: payload.message ?? "Handle is not available.",
          });
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setHandleStatus({ kind: "unavailable", message: "Could not check availability." });
        }
      }
    }, 400);
    return () => { clearTimeout(t); controller.abort(); };
  }, [ownerProfileHandle]);

  async function handleSaveOwnerProfile() {
    setOwnerProfileSaving(true);
    setOwnerProfileError(null);
    try {
      const body: Record<string, string> = {
        full_name: ownerProfileName,
        job_title: ownerProfileJobTitle,
      };
      if (handleStatus.kind === "available") {
        body.handle = handleStatus.handle;
      }
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setOwnerProfileName(payload?.profile?.full_name ?? "");
      setOwnerProfileJobTitle(payload?.profile?.job_title ?? "");
      if (payload?.profile?.handle) {
        setOwnerProfileHandle(payload.profile.handle);
        setHandleStatus({ kind: "idle" });
      }
      setOwnerProfileSaved(true);
      setTimeout(() => setOwnerProfileSaved(false), 3000);
    } catch (error) {
      console.error("Failed to save profile", error);
      setOwnerProfileError(
        error instanceof Error ? error.message : "Failed to save profile."
      );
    } finally {
      setOwnerProfileSaving(false);
    }
  }

  async function handleAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file (PNG, JPG, WEBP, or GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Image must be under 5 MB.");
      return;
    }
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/me/avatar", { method: "POST", body });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setOwnerProfileAvatarUrl(payload?.profile?.avatar_url ?? null);
    } catch (error) {
      console.error("Failed to upload avatar", error);
      setAvatarError(
        error instanceof Error ? error.message : "Failed to upload photo."
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      setOwnerProfileAvatarUrl(null);
    } catch (error) {
      console.error("Failed to remove avatar", error);
      setAvatarError(
        error instanceof Error ? error.message : "Failed to remove photo."
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  useEffect(() => {
    if (!tabs.find((t) => t.label === "Organization")) return;

    let cancelled = false;

    async function loadOrganization() {
      setOrganizationLoading(true);
      setOrganizationError(null);
      try {
        const res = await fetch("/api/organization", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error ?? `HTTP ${res.status}`);
        }

        const org = payload?.organization ?? {};
        if (cancelled) return;

        setOrganizationForm({
          name: org?.name ?? "",
          logoUrl: org?.logo_url ?? "",
          businessEmail: org?.business_email ?? "",
          businessPhone: org?.business_phone ?? "",
          websiteUrl: org?.website_url ?? "",
          companyAddress: org?.company_address ?? "",
          invoiceFooter: org?.invoice_footer ?? "",
          estimateTerms: org?.estimate_terms ?? "",
          workOrderTerms: org?.work_order_terms ?? "",
        });
        setChecklistDrafts(checklistTemplatesToDrafts(org?.checklist_templates));
        setReferenceLibrary(extractChecklistTemplateReferenceLibrary(org?.checklist_templates));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load organization settings", error);
          setOrganizationError(
            error instanceof Error ? error.message : "Failed to load organization settings."
          );
        }
      } finally {
        if (!cancelled) setOrganizationLoading(false);
      }
    }

    loadOrganization();

    return () => {
      cancelled = true;
    };
  }, [tabs]);

  const handleInlineRateSave = (memberId: string) => {
    const parsed = parseFloat(rateInputValue);
    if (!isNaN(parsed) && parsed >= 0) {
      updateMember(memberId, { rate: parsed });
    }
    setEditingRateMemberId(null);
  };

  const handleOrganizationSave = async () => {
    setOrganizationSaving(true);
    setOrganizationSaved(false);
    setOrganizationError(null);

    try {
      const checklistTemplates = draftsToChecklistTemplates(
        checklistDrafts,
        organizationForm.name,
        referenceLibrary
      );

      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organizationForm.name,
          logo_url: organizationForm.logoUrl,
          business_email: organizationForm.businessEmail,
          business_phone: organizationForm.businessPhone,
          website_url: organizationForm.websiteUrl,
          company_address: organizationForm.companyAddress,
          invoice_footer: organizationForm.invoiceFooter,
          estimate_terms: organizationForm.estimateTerms,
          work_order_terms: organizationForm.workOrderTerms,
          checklist_templates: mergeChecklistTemplatesWithReferenceLibrary(
            checklistTemplates,
            referenceLibrary
          ),
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }

      setOrganizationSaved(true);
      setTimeout(() => setOrganizationSaved(false), 3000);
    } catch (error) {
      console.error("Failed to save organization settings", error);
      setOrganizationError(
        error instanceof Error ? error.message : "Failed to save organization settings."
      );
    } finally {
      setOrganizationSaving(false);
    }
  };

  const generatorAircraftContext = {
    make: generatorHints.makeModel.split(" ").filter(Boolean)[0] ?? undefined,
    model: generatorHints.makeModel.split(" ").slice(1).join(" ") || undefined,
    engineModel: generatorHints.engineType || undefined,
  };

  const handleGenerateChecklistDraft = (templateKey: string) => {
    const lines = generateChecklistTemplateDraft({
      templateKey,
      aircraft: generatorAircraftContext,
      referenceAssets: referenceLibrary.checklist[templateKey] ?? [],
    });

    setChecklistDrafts((prev) => ({
      ...prev,
      [templateKey]: lines.join("\n"),
    }));
    setOrganizationSaved(false);
  };

  const handleChecklistAssetUpload = async (
    file: File,
    kind: "checklist" | "logbook",
    templateKey?: string
  ) => {
    if (!file) return;

    if (kind === "checklist" && !templateKey) return;

    if (kind === "checklist") {
      setTemplateUploadTarget(templateKey ?? null);
    } else {
      setLogbookUploadPending(true);
    }
    setOrganizationError(null);

    try {
      const initRes = await fetch("/api/organization/template-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/pdf",
          kind,
          templateKey,
        }),
      });
      const initPayload = await initRes.json().catch(() => null);
      if (!initRes.ok) {
        throw new Error(initPayload?.error ?? `HTTP ${initRes.status}`);
      }

      const supabase = createBrowserSupabase();
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(initPayload.uploadPath, initPayload.uploadToken, file);

      if (uploadError) {
        throw uploadError;
      }

      const asset = initPayload.asset as ChecklistTemplateReferenceAsset;
      setReferenceLibrary((prev) => {
        if (kind === "logbook") {
          return {
            ...prev,
            logbook: [...prev.logbook, asset],
          };
        }

        return {
          ...prev,
          checklist: {
            ...prev.checklist,
            [templateKey!]: [...(prev.checklist[templateKey!] ?? []), asset],
          },
        };
      });
      setOrganizationSaved(false);
    } catch (error) {
      console.error("Failed to upload template reference", error);
      setOrganizationError(
        error instanceof Error ? error.message : "Failed to upload template reference."
      );
    } finally {
      setTemplateUploadTarget(null);
      setLogbookUploadPending(false);
      if (kind === "logbook" && logbookInputRef.current) {
        logbookInputRef.current.value = "";
      }
      if (kind === "checklist" && templateKey && checklistInputRefs.current[templateKey]) {
        checklistInputRefs.current[templateKey]!.value = "";
      }
    }
  };

  const removeChecklistReferenceAsset = (templateKey: string, assetId: string) => {
    setReferenceLibrary((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [templateKey]: (prev.checklist[templateKey] ?? []).filter((asset) => asset.id !== assetId),
      },
    }));
    setOrganizationSaved(false);
  };

  const updateChecklistReferenceAssetNote = (
    templateKey: string,
    assetId: string,
    note: string
  ) => {
    setReferenceLibrary((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [templateKey]: (prev.checklist[templateKey] ?? []).map((asset) =>
          asset.id === assetId ? { ...asset, note } : asset
        ),
      },
    }));
    setOrganizationSaved(false);
  };

  const removeLogbookReferenceAsset = (assetId: string) => {
    setReferenceLibrary((prev) => ({
      ...prev,
      logbook: prev.logbook.filter((asset) => asset.id !== assetId),
    }));
    setOrganizationSaved(false);
  };

  const updateLogbookReferenceAssetNote = (assetId: string, note: string) => {
    setReferenceLibrary((prev) => ({
      ...prev,
      logbook: prev.logbook.map((asset) =>
        asset.id === assetId ? { ...asset, note } : asset
      ),
    }));
    setOrganizationSaved(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Settings</h1>
        {isRestrictedMechanic && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-[12px] px-3 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Personal settings only · {activeMechanic.role}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-[200px] shrink-0 space-y-0.5">
          {tabs.map((t) => (
            <button
              key={t.label}
              onClick={() => { setActiveTab(t.label); setSelectedCustomer(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors text-left ${
                validTab === t.label ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/50"
              }`}
              style={{ fontWeight: 500 }}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1">

          {/* ── Profile ── */}
          {validTab === "Profile" && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-border p-6">
                <h2 className="text-[16px] text-foreground mb-5" style={{ fontWeight: 600 }}>Profile Settings</h2>
                <div className="space-y-4 max-w-md">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center overflow-hidden text-[22px] ${
                      persona === "mechanic" ? activeMechanic.color : "bg-primary/10"
                    }`} style={{ fontWeight: 700 }}>
                      {persona === "owner" && ownerProfileAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ownerProfileAvatarUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : persona === "mechanic" ? (
                        activeMechanic.initials
                      ) : (
                        <User className="w-7 h-7 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                        {persona === "mechanic"
                          ? activeMechanic.name
                          : (ownerProfileName || ownerProfileEmail || "Set your name")}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {persona === "mechanic"
                          ? activeMechanic.role
                          : (ownerProfileJobTitle || "Owner / Operator")}
                      </div>
                      {persona === "owner" && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                            onChange={handleAvatarFileSelected}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={avatarUploading || ownerProfileLoading}
                            className="text-[11px] text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {avatarUploading && <Loader2 className="w-3 h-3 animate-spin" />}
                            {ownerProfileAvatarUrl ? "Change photo" : "Upload photo"}
                          </button>
                          {ownerProfileAvatarUrl && !avatarUploading && (
                            <button
                              type="button"
                              onClick={handleAvatarRemove}
                              className="text-[11px] text-muted-foreground hover:text-red-600"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                      {avatarError && (
                        <div className="text-[11px] text-red-600 mt-1">{avatarError}</div>
                      )}
                    </div>
                  </div>

                  {persona === "mechanic" ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Full Name</label>
                          <input value={profileName} onChange={e => setProfileName(e.target.value)}
                            className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                          <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Email</label>
                          <input value={profileEmail} onChange={e => setProfileEmail(e.target.value)} type="email"
                            className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Role</label>
                        <input value={activeMechanic.role} disabled
                          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-muted/20 outline-none opacity-60" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>License / Cert Type</label>
                          <select value={profileLicenseType} onChange={e => setProfileLicenseType(e.target.value as LicenseType)}
                            className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                            <option value="A&P/IA">A&P / IA (Inspection Authorization)</option>
                            <option value="A&P Mechanic">A&P Mechanic</option>
                            <option value="Student A&P">Student A&P (No License)</option>
                            <option value="None">None (Assistant / No Cert)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
                            License Number
                            {(profileLicenseType === "A&P/IA" || profileLicenseType === "A&P Mechanic") && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <input value={profileLicenseNumber} onChange={e => setProfileLicenseNumber(e.target.value)}
                            placeholder={profileLicenseType === "None" || profileLicenseType === "Student A&P" ? "N/A" : "FAA Certificate #"}
                            disabled={profileLicenseType === "None" || profileLicenseType === "Student A&P"}
                            className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:bg-muted/20"
                            style={{ fontWeight: 600 }} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Labor Rate ($/hr) — My Rate</label>
                        <div className="flex items-center border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                          <span className="px-3 py-2 text-[13px] text-muted-foreground bg-muted/30 border-r border-border">$</span>
                          <input type="number" min="0" step="1" value={profileRate}
                            onChange={e => setProfileRate(e.target.value)}
                            className="flex-1 px-3 py-2 text-[13px] outline-none" style={{ fontWeight: 600 }} />
                          <span className="px-3 py-2 text-[12px] text-muted-foreground">/hr</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Used as default on work orders and estimates you create.</p>
                      </div>
                      {profileSaved && (
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[12px]">
                          <CheckCircle className="w-3.5 h-3.5" /> Profile saved successfully
                        </div>
                      )}
                      <button
                        onClick={() => {
                          updateMember(activeMechanic.id, {
                            name: profileName, email: profileEmail,
                            rate: parseFloat(profileRate) || 0,
                            licenseType: profileLicenseType,
                            licenseNumber: profileLicenseNumber,
                            cert: profileLicenseType === "None" || profileLicenseType === "Student A&P"
                              ? profileLicenseType
                              : `${profileLicenseType} #${profileLicenseNumber}`,
                          });
                          setProfileSaved(true);
                          setTimeout(() => setProfileSaved(false), 3000);
                        }}
                        className="bg-primary text-white px-5 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors"
                        style={{ fontWeight: 600 }}
                      >
                        Save Profile
                      </button>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Full Name</label>
                        <input
                          type="text"
                          value={ownerProfileName}
                          onChange={(e) => setOwnerProfileName(e.target.value)}
                          disabled={ownerProfileLoading || ownerProfileSaving}
                          placeholder={ownerProfileLoading ? "Loading…" : "Your full name"}
                          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Email</label>
                        <input
                          type="email"
                          value={ownerProfileEmail}
                          disabled
                          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-muted/20 outline-none disabled:opacity-60"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Email is managed by your sign-in. Contact support to change it.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Job Title</label>
                        <input
                          type="text"
                          value={ownerProfileJobTitle}
                          onChange={(e) => setOwnerProfileJobTitle(e.target.value)}
                          disabled={ownerProfileLoading || ownerProfileSaving}
                          placeholder="e.g. Owner / Operator"
                          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
                          Your public URL
                        </label>
                        <div className="flex items-stretch border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                          <span className="px-3 py-2 text-[12px] text-muted-foreground bg-muted/30 border-r border-border whitespace-nowrap">
                            myaircraft.us/{ownerProfilePersona === "mechanic" ? "mechanic" : "owner"}/
                          </span>
                          <input
                            type="text"
                            value={ownerProfileHandle}
                            onChange={(e) => setOwnerProfileHandle(e.target.value.toLowerCase())}
                            disabled={ownerProfileLoading || ownerProfileSaving}
                            placeholder="your-handle"
                            spellCheck={false}
                            className="flex-1 px-3 py-2 text-[13px] outline-none disabled:opacity-50"
                          />
                        </div>
                        <div className="mt-1 text-[11px] min-h-[14px]">
                          {handleStatus.kind === "checking" && (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Checking availability…
                            </span>
                          )}
                          {handleStatus.kind === "available" && (
                            <span className="text-emerald-700">✓ Available</span>
                          )}
                          {handleStatus.kind === "unavailable" && (
                            <span className="text-red-600">{handleStatus.message}</span>
                          )}
                          {handleStatus.kind === "idle" && ownerProfileHandle && (
                            <span className="text-muted-foreground">
                              3–32 chars, lowercase letters / numbers / dashes.
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Role</label>
                        <input
                          type="text"
                          value="Owner / Operator"
                          disabled
                          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-muted/20 outline-none disabled:opacity-60"
                        />
                      </div>
                      {ownerProfileError && (
                        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> {ownerProfileError}
                        </div>
                      )}
                      {ownerProfileSaved && (
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[12px]">
                          <CheckCircle className="w-3.5 h-3.5" /> Profile saved successfully
                        </div>
                      )}
                      <button
                        onClick={handleSaveOwnerProfile}
                        disabled={ownerProfileLoading || ownerProfileSaving}
                        className="bg-primary text-white px-5 py-2 rounded-lg text-[13px] mt-2 hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                        style={{ fontWeight: 600 }}
                      >
                        {ownerProfileSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save Changes
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {validTab === "Notifications" && (
            <div className="bg-white rounded-xl border border-border p-6">
              <h2 className="text-[16px] text-foreground mb-4" style={{ fontWeight: 600 }}>Notification Settings</h2>
              <div className="space-y-4 max-w-lg">
                {[
                  { label: "New work order assigned", desc: "Get notified when a work order is assigned to you", on: true },
                  { label: "Work order status change", desc: "Updates when a WO status is changed", on: true },
                  { label: "Customer message received", desc: "When a customer replies to an estimate or update", on: false },
                  { label: "Logbook entry ready to sign", desc: "Reminder when a draft entry needs your signature", on: true },
                  { label: "Parts status update", desc: "When backordered or ordered parts arrive", on: false },
                ].map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
                    <div>
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{item.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</div>
                    </div>
                    <Toggle checked={item.on} onChange={() => {}} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Users (owner persona only) ── */}
          {validTab === "Users" && (
            <div className="rounded-xl border border-border overflow-hidden" style={{ height: "calc(100vh - 260px)" }}>
              <UsersPage />
            </div>
          )}

          {/* ── Team (mechanic persona only) ── */}
          {validTab === "Team" && (
            <div className="space-y-4">
              {/* Lead mechanic privilege notice */}
              {isLeadMechanic && (
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <HardHat className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-blue-700 leading-relaxed">
                    <span style={{ fontWeight: 700 }}>Lead Mechanic / IA privileges active.</span>{" "}
                    You can invite new members, set and edit their labor rates, and manage permissions for your entire team.
                    Hover any member row to edit their rate inline.
                  </p>
                </div>
              )}

              <div className="bg-white rounded-xl border border-border">
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-[16px] text-foreground" style={{ fontWeight: 600 }}>Team Members</h2>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {team.filter(m => m.status === "Active").length} active · {team.filter(m => m.status === "Invited").length} pending invite
                      {!isLeadMechanic && <span className="ml-2 text-primary">· Click Permissions to manage access</span>}
                    </p>
                  </div>
                  {isLeadMechanic && (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Invite Member
                    </button>
                  )}
                </div>

                {/* Member rows */}
                <div className="divide-y divide-border">
                  {team.map((m) => {
                    const isEditingRate = editingRateMemberId === m.id;
                    const isSelf = m.id === activeMechanic.id;
                    const roleColor: Record<string, string> = {
                      "Lead Mechanic / IA": "text-blue-700 bg-blue-50",
                      "Mechanic": "text-violet-700 bg-violet-50",
                      "Apprentice Mechanic": "text-slate-600 bg-slate-100",
                      "Read Only": "text-amber-700 bg-amber-50",
                    };
                    return (
                      <div key={m.id} className="p-4 flex items-center gap-4 hover:bg-muted/10 transition-colors group">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] shrink-0 ${m.color}`} style={{ fontWeight: 700 }}>
                          {m.initials}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{m.name}</span>
                            {isSelf && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>You</span>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${roleColor[m.role] || "text-primary bg-primary/8"}`} style={{ fontWeight: 600 }}>
                              {m.role}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.status === "Active" ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50"}`} style={{ fontWeight: 600 }}>
                              {m.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{m.email}</div>
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {m.cert}{m.specialty ? ` · ${m.specialty}` : ""}
                          </div>
                        </div>

                        {/* Rate column */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isLeadMechanic && isEditingRate ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center border border-primary/40 bg-white rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                                <span className="px-2 py-1.5 text-[11px] text-muted-foreground bg-muted/30 border-r border-border">$</span>
                                <input
                                  type="number" min="0" step="1"
                                  value={rateInputValue}
                                  onChange={e => setRateInputValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleInlineRateSave(m.id);
                                    if (e.key === "Escape") setEditingRateMemberId(null);
                                  }}
                                  className="w-16 px-2 py-1.5 text-[12px] outline-none text-right"
                                  style={{ fontWeight: 600 }}
                                  autoFocus
                                />
                                <span className="px-2 py-1.5 text-[11px] text-muted-foreground">/hr</span>
                              </div>
                              <button onClick={() => handleInlineRateSave(m.id)}
                                className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingRateMemberId(null)}
                                className="w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70 flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {m.rate > 0 ? (
                                <span className="text-[12px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1" style={{ fontWeight: 700 }}>
                                  <DollarSign className="w-3 h-3" />{m.rate}/hr
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground/60 italic">No rate set</span>
                              )}
                              {isLeadMechanic && (
                                <button
                                  onClick={() => {
                                    setEditingRateMemberId(m.id);
                                    setRateInputValue(String(m.rate || 0));
                                  }}
                                  title={`Edit ${m.name.split(" ")[0]}'s labor rate`}
                                  className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-all"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Permissions button */}
                        <button
                          onClick={() => setEditingMember(m)}
                          className="shrink-0 flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <Shield className="w-3.5 h-3.5" /> Permissions
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer tip */}
                <div className="p-4 border-t border-border bg-muted/20 rounded-b-xl">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isLeadMechanic ? (
                      <><span style={{ fontWeight: 600 }}>Tip:</span> Hover any row to edit their labor rate inline, or click <span style={{ fontWeight: 600 }}>Permissions</span> to set rates alongside access controls. Use the "Viewing As" switcher in the sidebar to demo their exact portal view.</>
                    ) : (
                      <><span style={{ fontWeight: 600 }}>Tip:</span> Click <span style={{ fontWeight: 600 }}>Permissions</span> to see what each role can access. Only a Lead Mechanic / IA can change labor rates or invite new members.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Customers ── */}
          {validTab === "Customers" && !selectedCustomer && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] text-foreground" style={{ fontWeight: 600 }}>Customers</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {customers.length} customers · ${customers.reduce((s, c) => s + c.outstandingBalance, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} outstanding
                  </p>
                </div>
                <button className="bg-primary text-white px-3 py-1.5 rounded-lg text-[13px]" style={{ fontWeight: 500 }}>+ Add Customer</button>
              </div>
              <div className="bg-white rounded-xl border border-border divide-y divide-border">
                {customers.length === 0 && (
                  <div className="p-8 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-[13px] text-muted-foreground">No customers yet — they'll appear here when you create work orders, estimates, or invoices.</p>
                  </div>
                )}
                {customers.map((c) => (
                  <button key={c.id} onClick={() => setSelectedCustomer(c)}
                    className="w-full text-left p-4 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[13px] text-primary" style={{ fontWeight: 700 }}>{c.name[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 500 }}>{c.name}</div>
                        {c.company && <div className="text-[11px] text-muted-foreground truncate">{c.company}</div>}
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" style={{ fontWeight: 600 }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 text-right">
                      <div><div className="text-[11px] text-muted-foreground">Aircraft</div><div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{c.aircraft.join(", ")}</div></div>
                      <div><div className="text-[11px] text-muted-foreground">WOs</div><div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{c.totalWorkOrders}</div></div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Outstanding</div>
                        <div className={`text-[13px] ${c.outstandingBalance > 0 ? "text-destructive" : "text-emerald-600"}`} style={{ fontWeight: 600 }}>
                          {c.outstandingBalance > 0 ? `$${c.outstandingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "Paid"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Last Service</div>
                        <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>
                          {c.lastService ? new Date(c.lastService).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Customer Detail ── */}
          {validTab === "Customers" && selectedCustomer && (
            <div className="space-y-4">
              <button onClick={() => setSelectedCustomer(null)} className="text-[12px] text-primary flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                ← Back to Customers
              </button>
              <div className="bg-white rounded-xl border border-border p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-[20px] text-primary" style={{ fontWeight: 700 }}>{selectedCustomer.name[0]}</span>
                    </div>
                    <div>
                      <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>{selectedCustomer.name}</h2>
                      {selectedCustomer.company && <p className="text-[13px] text-muted-foreground">{selectedCustomer.company}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {selectedCustomer.tags.map(tag => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-primary" style={{ fontWeight: 600 }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button className="text-[13px] text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>Edit</button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    { icon: Mail, label: "Email", value: selectedCustomer.email },
                    { icon: Phone, label: "Phone", value: selectedCustomer.phone },
                    { icon: Plane, label: "Aircraft", value: selectedCustomer.aircraft.join(", ") },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                      <row.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{row.label}</div>
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{row.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-border pt-5">
                  {[
                    { label: "Work Orders", value: selectedCustomer.totalWorkOrders },
                    { label: "Total Billed", value: `$${selectedCustomer.totalBilled.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
                    { label: "Outstanding", value: selectedCustomer.outstandingBalance > 0 ? `$${selectedCustomer.outstandingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "None", highlight: selectedCustomer.outstandingBalance > 0 },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className={`text-[22px] tracking-tight ${stat.highlight ? "text-destructive" : "text-foreground"}`} style={{ fontWeight: 700 }}>{stat.value}</div>
                      <div className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Billing ── */}
          {validTab === "Billing" && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-border p-6">
                <h2 className="text-[16px] text-foreground mb-4" style={{ fontWeight: 600 }}>Current Plan</h2>
                <div className="flex items-center justify-between bg-primary/5 rounded-xl p-4">
                  <div>
                    <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>3 Aircraft &middot; 1 Mechanic</div>
                    <div className="text-[12px] text-muted-foreground">$400/month &middot; Billed monthly</div>
                  </div>
                  <button className="text-[13px] text-primary" style={{ fontWeight: 500 }}>Manage Plan</button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-border p-6">
                <h2 className="text-[16px] text-foreground mb-4" style={{ fontWeight: 600 }}>Payment Method</h2>
                <div className="flex items-center gap-3 bg-muted/20 rounded-lg p-3">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>Visa ending in 4242</div>
                    <div className="text-[11px] text-muted-foreground">Expires 12/2027</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Other tabs ── */}
          {validTab === "Organization" && (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-border p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-[16px] text-foreground" style={{ fontWeight: 600 }}>Organization Settings</h2>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Company profile, branded defaults, and checklist templates used before AI fallback.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 min-w-[220px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                        {organizationForm.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={organizationForm.logoUrl} alt="Organization logo" className="w-full h-full object-cover" />
                        ) : (
                          <MyAircraftLogo className="w-7 h-7 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>
                          {organizationForm.name || "Organization"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          Source of truth for invoices, estimates, work orders, and checklist defaults
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {organizationError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {organizationError}
                  </div>
                )}
                {organizationSaved && (
                  <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" /> Organization settings saved successfully
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Company / Organization Name</label>
                    <input
                      value={organizationForm.name}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Logo URL</label>
                    <input
                      value={organizationForm.logoUrl}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Business Email</label>
                    <input
                      value={organizationForm.businessEmail}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, businessEmail: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Business Phone</label>
                    <input
                      value={organizationForm.businessPhone}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, businessPhone: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Website</label>
                    <input
                      value={organizationForm.websiteUrl}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, websiteUrl: e.target.value }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Company Address</label>
                    <textarea
                      value={organizationForm.companyAddress}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, companyAddress: e.target.value }))}
                      rows={3}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border p-6">
                <h3 className="text-[15px] text-foreground mb-4" style={{ fontWeight: 600 }}>Branded Document Defaults</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Estimate Terms</label>
                    <textarea
                      value={organizationForm.estimateTerms}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, estimateTerms: e.target.value }))}
                      rows={4}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Work Order Terms</label>
                    <textarea
                      value={organizationForm.workOrderTerms}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, workOrderTerms: e.target.value }))}
                      rows={4}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Invoice Footer</label>
                    <textarea
                      value={organizationForm.invoiceFooter}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, invoiceFooter: e.target.value }))}
                      rows={4}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Checklist Templates</h3>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      One line per checklist item. Shop templates become the primary source of truth before the fallback generator runs.
                    </p>
                  </div>
                  {organizationLoading && (
                    <div className="text-[12px] text-muted-foreground">Loading…</div>
                  )}
                </div>

                <div className="mb-5 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        Checklist Generator Context
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Use these hints when generating a baseline checklist for a make/model or engine family. Uploaded shop references still win first.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGeneratorHints({ makeModel: "", engineType: "" })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted/30"
                      style={{ fontWeight: 500 }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset hints
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
                        Make / Model Hint
                      </label>
                      <input
                        value={generatorHints.makeModel}
                        onChange={(e) =>
                          setGeneratorHints((prev) => ({ ...prev, makeModel: e.target.value }))
                        }
                        placeholder="Cessna 172S"
                        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
                        Engine Type Hint
                      </label>
                      <input
                        value={generatorHints.engineType}
                        onChange={(e) =>
                          setGeneratorHints((prev) => ({ ...prev, engineType: e.target.value }))
                        }
                        placeholder="Lycoming O-320 / Continental IO-550"
                        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {CHECKLIST_TEMPLATE_FIELDS.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <label className="block text-[12px] text-muted-foreground" style={{ fontWeight: 500 }}>{field.label}</label>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(node) => {
                              checklistInputRefs.current[field.key] = node
                            }}
                            type="file"
                            accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png,.heic"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) {
                                void handleChecklistAssetUpload(file, "checklist", field.key)
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => checklistInputRefs.current[field.key]?.click()}
                            disabled={templateUploadTarget === field.key}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30 disabled:opacity-60"
                            style={{ fontWeight: 500 }}
                          >
                            {templateUploadTarget === field.key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            Upload ref
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGenerateChecklistDraft(field.key)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary hover:bg-primary/15"
                            style={{ fontWeight: 600 }}
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Generate
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={checklistDrafts[field.key]}
                        onChange={(e) =>
                          setChecklistDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        rows={6}
                        placeholder={`Enter one ${field.label.toLowerCase()} checklist item per line`}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="mt-2 space-y-2">
                        {(referenceLibrary.checklist[field.key] ?? []).length > 0 ? (
                          (referenceLibrary.checklist[field.key] ?? []).map((asset) => (
                            <div
                              key={asset.id}
                              className="rounded-lg border border-border bg-muted/20 px-3 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center">
                                  <ClipboardList className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 600 }}>
                                    {asset.name}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {asset.sizeBytes ? formatBytes(asset.sizeBytes, 1) : "Reference upload"} · {formatTemplateUploadDate(asset.uploadedAt)}
                                  </div>
                                  <input
                                    type="text"
                                    value={asset.note ?? ""}
                                    onChange={(event) =>
                                      updateChecklistReferenceAssetNote(field.key, asset.id, event.target.value)
                                    }
                                    placeholder="Optional note for mechanics: when to use this reference"
                                    className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeChecklistReferenceAsset(field.key, asset.id)}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white hover:text-red-600"
                                  title="Remove reference"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            No uploaded reference yet. If you upload your shop’s own checklist, that reference will be carried into new work orders before fallback generation.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground max-w-2xl">
                    Example: if your shop has its own 100-hour checklist, enter it here and that version will be attached to new work orders instead of the fallback FAA/manufacturer-style baseline.
                  </p>
                  <button
                    onClick={handleOrganizationSave}
                    disabled={organizationSaving || organizationLoading}
                    className="bg-primary text-white px-5 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors disabled:opacity-60"
                    style={{ fontWeight: 600 }}
                  >
                    {organizationSaving ? "Saving..." : "Save Organization"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-border p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>
                      Logbook Entry Reference Library
                    </h3>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Upload signed sample entries, return-to-service wording, or house-style examples so your mechanics have a durable wording source inside the shop profile.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={logbookInputRef}
                      type="file"
                      accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png,.heic"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          void handleChecklistAssetUpload(file, "logbook")
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => logbookInputRef.current?.click()}
                      disabled={logbookUploadPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted/30 disabled:opacity-60"
                      style={{ fontWeight: 500 }}
                    >
                      {logbookUploadPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      Upload logbook reference
                    </button>
                  </div>
                </div>

                {referenceLibrary.logbook.length > 0 ? (
                  <div className="space-y-2">
                    {referenceLibrary.logbook.map((asset) => (
                      <div
                        key={asset.id}
                        className="rounded-lg border border-border bg-muted/20 px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-white border border-border flex items-center justify-center">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>
                              {asset.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {asset.sizeBytes ? formatBytes(asset.sizeBytes, 1) : "Reference upload"} · {formatTemplateUploadDate(asset.uploadedAt)}
                            </div>
                            <input
                              type="text"
                              value={asset.note ?? ""}
                              onChange={(event) =>
                                updateLogbookReferenceAssetNote(asset.id, event.target.value)
                              }
                              placeholder="Optional note: house style, sample signoff, return-to-service wording, etc."
                              className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLogbookReferenceAsset(asset.id)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-white hover:text-red-600"
                            title="Remove logbook reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-5 text-[12px] text-muted-foreground">
                    No shop logbook examples uploaded yet. Add a few approved entries here so your mechanics have a stable wording reference when drafting new entries.
                  </div>
                )}
              </div>
            </div>
          )}

          {validTab === "Security" && (
            <div className="bg-white rounded-xl border border-border p-6">
              <h2 className="text-[16px] text-foreground mb-4" style={{ fontWeight: 600 }}>{validTab} Settings</h2>
              <p className="text-[13px] text-muted-foreground">Configure your {validTab.toLowerCase()} preferences here.</p>
            </div>
          )}

          {/* ── Integrations (owner + mechanic) ── */}
          {validTab === "Integrations" && <IntegrationsPage />}

          {/* ── API (owner + mechanic) ── */}
          {validTab === "API" && <ApiSettingsPage />}
        </div>
      </div>

      {/* ── Member permission drawer ── */}
      <AnimatePresence>
        {editingMember && (
          <MemberPermissionDrawer
            member={editingMember}
            isLeadMechanic={isLeadMechanic}
            onClose={() => setEditingMember(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Invite Member Modal ── */}
      <AnimatePresence>
        {showInviteModal && (
          <InviteMemberModal
            onClose={() => setShowInviteModal(false)}
            onInvite={(m) => {
              addTeamMember(m);
              setShowInviteModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Toggle ──────────────────────────────────────────────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${checked ? "bg-primary" : "bg-border"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  );
}

/* ─── Member Permission Drawer ────────────────────────────────── */
function MemberPermissionDrawer({
  member, isLeadMechanic, onClose,
}: {
  member: TeamMember;
  isLeadMechanic: boolean;
  onClose: () => void;
}) {
  const { updateMemberPermissions, updateMemberRole, updateMember } = useAppContext();

  const [localPerms, setLocalPerms] = useState<MechanicPermissions>({ ...member.permissions });
  const [localRole, setLocalRole] = useState<TeamMemberRole>(member.role);
  const [localRate, setLocalRate] = useState(String(member.rate ?? 0));
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  function togglePerm(key: keyof MechanicPermissions) {
    setLocalPerms((p) => ({ ...p, [key]: !p[key] }));
  }

  function applyPreset(role: TeamMemberRole) {
    setLocalRole(role);
    setLocalPerms({ ...ROLE_DEFAULTS[role] });
    setRoleMenuOpen(false);
  }

  function handleSave() {
    updateMemberPermissions(member.id, localPerms);
    updateMemberRole(member.id, localRole);
    if (isLeadMechanic) {
      updateMember(member.id, { rate: parseFloat(localRate) || 0 });
    }
    setSaved(true);
    setTimeout(onClose, 900);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#0A1628] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] ${member.color}`} style={{ fontWeight: 700 }}>
              {member.initials}
            </div>
            <div>
              <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>{member.name}</div>
              <div className="text-white/50 text-[11px]">{member.cert}{member.specialty ? ` · ${member.specialty}` : ""}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Labor Rate — Lead Mechanic editable */}
          {isLeadMechanic && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <label className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>
                  Labor Rate
                  <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Lead Mechanic privilege</span>
                </label>
              </div>
              <div className="flex items-center border border-emerald-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-emerald-400/30">
                <span className="px-3 py-2.5 text-[14px] text-muted-foreground bg-muted/30 border-r border-border">$</span>
                <input
                  type="number" min="0" step="1" value={localRate}
                  onChange={e => setLocalRate(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-[15px] outline-none"
                  style={{ fontWeight: 700 }}
                />
                <span className="px-3 py-2.5 text-[13px] text-muted-foreground border-l border-border">/hr</span>
              </div>
              <p className="text-[11px] text-emerald-700/70 mt-2">
                This is {member.name.split(" ")[0]}'s billed labor rate on work orders and estimates. Only Lead Mechanic / IA can set this.
              </p>
            </div>
          )}

          {/* Role */}
          <div>
            <label className="text-[12px] text-foreground mb-2 block" style={{ fontWeight: 600 }}>Role</label>
            <div className="relative">
              <button
                onClick={() => setRoleMenuOpen((o) => !o)}
                className="w-full flex items-center justify-between border border-border rounded-xl px-4 py-2.5 text-[13px] bg-white hover:border-primary/40 transition-colors"
              >
                <span style={{ fontWeight: 500 }}>{localRole}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {roleMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl z-10"
                  >
                    {ROLES.map((r) => (
                      <button key={r} onClick={() => applyPreset(r)}
                        className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted/40 transition-colors first:rounded-t-xl last:rounded-b-xl flex items-center justify-between ${localRole === r ? "bg-primary/5 text-primary" : "text-foreground"}`}
                        style={{ fontWeight: localRole === r ? 600 : 400 }}>
                        {r}
                        {localRole === r && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Changing role applies preset permissions. You can customize per-toggle below.</p>
          </div>

          {/* Permission groups */}
          {PERM_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>{group.label}</div>
              <div className="bg-muted/20 rounded-xl overflow-hidden border border-border">
                {group.items.map((item, idx) => (
                  <div key={item.key} className={`flex items-start justify-between gap-3 px-4 py-3 ${idx !== group.items.length - 1 ? "border-b border-border" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{item.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</div>
                    </div>
                    <Toggle checked={localPerms[item.key] as boolean} onChange={() => togglePerm(item.key)} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-1">
            <div className="text-[11px] text-primary mb-2" style={{ fontWeight: 700 }}>Permission Summary</div>
            {[
              { label: "Sidebar access", value: [
                localPerms.aiCommandCenter && "AI Command",
                localPerms.dashboard && "Dashboard",
                localPerms.aircraft && "Aircraft",
                localPerms.squawks && "Squawks",
                localPerms.estimates && "Estimates",
                localPerms.workOrders && "Work Orders",
                localPerms.invoices && "Invoices",
                localPerms.logbook && "Logbook",
              ].filter(Boolean).join(", ") || "None" },
              { label: "WO detail tabs", value: [
                localPerms.woLineItems && "Line Items",
                localPerms.woOwnersView && "Owner View",
                localPerms.woInvoice && "Invoice",
              ].filter(Boolean).join(", ") || "None" },
              { label: "Settings depth", value: localPerms.settingsFull ? "Full (Team, Billing, Org, Customers)" : "Profile + Notifications only" },
              { label: "Can close WO", value: localPerms.woCloseWO ? "Yes" : "No — lead mechanic only" },
            ].map((row) => (
              <div key={row.label} className="flex items-start gap-2 text-[11px]">
                <span className="text-muted-foreground w-28 shrink-0">{row.label}</span>
                <span className="text-foreground" style={{ fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-5 pt-4 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setLocalPerms({ ...ROLE_DEFAULTS[localRole] })}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontWeight: 500 }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to role defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saved}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] text-white transition-all ${saved ? "bg-emerald-600" : "bg-primary hover:bg-primary/90"}`}
            style={{ fontWeight: 600 }}
          >
            {saved ? <><Check className="w-4 h-4" /> Saved!</> : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Invite Member Modal ─────────────────────────────────────── */
function InviteMemberModal({ onClose, onInvite }: {
  onClose: () => void;
  onInvite: (m: Omit<TeamMember, "id">) => void;
}) {
  const [step, setStep] = useState<"form" | "preview" | "sent">("form");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Mechanic" as TeamMemberRole,
    licenseType: "A&P Mechanic" as LicenseType,
    licenseNumber: "",
    specialty: "",
    rate: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = "Valid email required";
    if ((form.licenseType === "A&P/IA" || form.licenseType === "A&P Mechanic") && !form.licenseNumber.trim())
      e.licenseNumber = "License # required for this cert type";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePreview = () => { if (validate()) setStep("preview"); };

  const handleSend = () => {
    setStep("sent");
    setTimeout(() => {
      const initials = form.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const COLORS = ["bg-blue-600 text-white", "bg-violet-600 text-white", "bg-teal-600 text-white", "bg-pink-600 text-white", "bg-orange-600 text-white"];
      onInvite({
        name: form.name, role: form.role,
        cert: form.licenseType === "None" || form.licenseType === "Student A&P"
          ? form.licenseType : `${form.licenseType} #${form.licenseNumber}`,
        email: form.email,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        initials, status: "Invited",
        permissions: { ...ROLE_DEFAULTS[form.role] },
        licenseType: form.licenseType, licenseNumber: form.licenseNumber,
        rate: parseFloat(form.rate) || 0, specialty: form.specialty,
      });
    }, 1200);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden">

        {/* Header */}
        <div className="bg-[#0A1628] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>
                {step === "sent" ? "Invite Sent!" : step === "preview" ? "Review Invite" : "Invite Team Member"}
              </div>
              <div className="text-white/50 text-[11px]">Blue Canyon Aviation · Mechanic Portal</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* ── Step: Form ── */}
        {step === "form" && (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Name + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Sarah Johnson"
                  className={`w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 ${errors.name ? "border-red-300 bg-red-50" : "border-border"}`} />
                {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input value={form.email} onChange={e => set("email", e.target.value.toLowerCase())}
                  type="email" placeholder="sarah@example.com"
                  className={`w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 ${errors.email ? "border-red-300 bg-red-50" : "border-border"}`} />
                {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email}</p>}
              </div>
            </div>

            {/* Role cards */}
            <div>
              <label className="block text-[11px] text-muted-foreground mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                Position / Role <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["Lead Mechanic / IA", "Mechanic", "Apprentice Mechanic", "Read Only"] as TeamMemberRole[]).map(role => {
                  const Icon = ROLE_ICON_MAP[role];
                  const isSelected = form.role === role;
                  return (
                    <button key={role} onClick={() => set("role", role)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        isSelected ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 hover:bg-muted/20"
                      }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? "bg-primary/15" : "bg-muted"}`}>
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="text-[12px]" style={{ fontWeight: isSelected ? 700 : 500 }}>{role}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{ROLE_DESC[role]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cert + License */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Certificate Type</label>
                <select value={form.licenseType} onChange={e => set("licenseType", e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                  <option value="A&P/IA">A&P / IA</option>
                  <option value="A&P Mechanic">A&P Mechanic</option>
                  <option value="Student A&P">Student A&P</option>
                  <option value="None">None</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  License Number
                  {(form.licenseType === "A&P/IA" || form.licenseType === "A&P Mechanic") && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)}
                  placeholder={form.licenseType === "None" || form.licenseType === "Student A&P" ? "N/A" : "FAA Cert #"}
                  disabled={form.licenseType === "None" || form.licenseType === "Student A&P"}
                  className={`w-full border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:bg-muted/20 ${errors.licenseNumber ? "border-red-300 bg-red-50" : "border-border"}`}
                  style={{ fontWeight: 600 }} />
                {errors.licenseNumber && <p className="text-[11px] text-red-500 mt-1">{errors.licenseNumber}</p>}
              </div>
            </div>

            {/* Specialty + Rate */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Specialty / Focus</label>
                <input value={form.specialty} onChange={e => set("specialty", e.target.value)}
                  placeholder="e.g. Powerplant, Avionics"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  Labor Rate ($/hr)
                  <span className="ml-1.5 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>You set this</span>
                </label>
                <div className="flex items-center border border-border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="px-3 py-2.5 text-[13px] text-muted-foreground bg-muted/30 border-r border-border">$</span>
                  <input type="number" min="0" step="1" value={form.rate}
                    onChange={e => set("rate", e.target.value)} placeholder="0"
                    className="flex-1 px-3 py-2.5 text-[13px] outline-none" style={{ fontWeight: 600 }} />
                  <span className="px-2 py-2.5 text-[12px] text-muted-foreground">/hr</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 border border-border rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handlePreview}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                Preview Invite →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Preview (email preview) ── */}
        {step === "preview" && (
          <div className="p-6 space-y-4">
            <p className="text-[12px] text-muted-foreground">
              This email will be sent to <span style={{ fontWeight: 600 }} className="text-foreground">{form.email}</span>:
            </p>

            {/* Simulated email */}
            <div className="border border-border rounded-xl overflow-hidden shadow-sm">
              {/* Browser chrome */}
              <div className="bg-muted/30 px-4 py-2.5 border-b border-border flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 bg-white rounded-md px-3 py-1 text-[11px] text-muted-foreground border border-border truncate">
                  From: noreply@myaircraft.us &nbsp;→&nbsp; To: {form.email}
                </div>
              </div>

              {/* Email body */}
              <div className="bg-white p-5 space-y-4">
                {/* Logo */}
                <div className="flex items-center gap-2 pb-4 border-b border-border">
                  <MyAircraftLogo variant="dark" height={20} />
                  <span className="text-[11px] text-muted-foreground ml-2">· Mechanic Portal</span>
                </div>

                <div>
                  <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Hi {form.name.split(" ")[0] || "there"},</p>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                    <span style={{ fontWeight: 600 }} className="text-foreground">Mike Torres (Lead Mechanic / IA)</span> has invited you to join the Mechanic Portal at{" "}
                    <span style={{ fontWeight: 600 }} className="text-foreground">Blue Canyon Aviation</span> on myaircraft.us.
                  </p>
                </div>

                {/* Role summary */}
                <div className="bg-[#F7F9FC] border border-[#E2E8F0] rounded-xl p-4">
                  <div className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide" style={{ fontWeight: 600 }}>Your Position Details</div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                    {[
                      { label: "Role", value: form.role },
                      { label: "Labor Rate", value: form.rate ? `$${form.rate}/hr` : "TBD" },
                      { label: "Certificate", value: form.licenseType },
                      { label: "Specialty", value: form.specialty || "—" },
                    ].map(row => (
                      <div key={row.label} className="flex gap-1">
                        <span className="text-muted-foreground shrink-0">{row.label}:</span>
                        <span className="text-foreground truncate" style={{ fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="text-center py-1">
                  <div className="inline-block bg-[#2563EB] text-white text-[13px] px-6 py-2.5 rounded-xl cursor-default" style={{ fontWeight: 600 }}>
                    Accept Invitation &amp; Set Password
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">This link expires in 7 days.</p>
                </div>

                <p className="text-[11px] text-muted-foreground text-center border-t border-border pt-3">
                  myaircraft.us · Aircraft Records Intelligence Platform<br />
                  If you didn't expect this, you can safely ignore it.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("form")}
                className="flex-1 py-2.5 border border-border rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                ← Edit Details
              </button>
              <button onClick={handleSend}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                <Send className="w-3.5 h-3.5" /> Send Invite
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Sent ── */}
        {step === "sent" && (
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </motion.div>
            <div>
              <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Invite Sent!</div>
              <p className="text-[13px] text-muted-foreground mt-1.5 max-w-xs">
                An invitation email has been sent to <span style={{ fontWeight: 600 }} className="text-foreground">{form.email}</span>.
                Once {form.name.split(" ")[0] || "they"} accepts, they'll appear as{" "}
                <span className="text-emerald-600" style={{ fontWeight: 600 }}>Active</span> in your team.
              </p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 w-full text-left space-y-2">
              {[
                { label: "Name", value: form.name },
                { label: "Email", value: form.email },
                { label: "Role", value: form.role },
                { label: "Labor Rate", value: form.rate ? `$${form.rate}/hr` : "Not set" },
                { label: "Status", value: "Pending Acceptance" },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-[12px]">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-foreground" style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full py-2.5 bg-primary text-white rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
              Done
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
