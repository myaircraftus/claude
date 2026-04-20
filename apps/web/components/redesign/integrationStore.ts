"use client";

import { useEffect, useState } from "react";

export type IntegrationId =
  | "flightschedulepro"
  | "flightcircle"
  | "schedulemaster"
  | "schedaero"
  | "myflightbook"
  | "aerocrew"
  | "fltplan"
  | "avplan"
  | "flightaware"
  | "adsbexchange"
  | "flightradar"
  | "camp"
  | "flightdocs"
  | "traxxall"
  | "quantum"
  | "corridor"
  | "atphub"
  | "winair"
  | "logbookpro"
  | "smartaviation"
  | "mxcommander"
  | "safetyculture"
  | "aviobook"
  | "quickbooks"
  | "freshbooks";

type IntegrationStatus = "connected" | "disconnected" | "error" | "syncing";

type IntegrationRecord = {
  integrationId?: string;
  provider: string;
  status: IntegrationStatus;
  lastSyncAt?: Date;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  aircraftCountSynced?: number;
  settings?: Record<string, unknown>;
};

const PROVIDER_BY_ID: Record<IntegrationId, string> = {
  flightschedulepro: "flight_schedule_pro",
  flightcircle: "flight_circle",
  schedulemaster: "schedule_master",
  schedaero: "schedaero",
  myflightbook: "myflightbook",
  aerocrew: "aerocrew",
  fltplan: "fltplan",
  avplan: "avplan",
  flightaware: "flightaware",
  adsbexchange: "adsb_exchange",
  flightradar: "flight_radar_24",
  camp: "camp",
  flightdocs: "flightdocs",
  traxxall: "traxxall",
  quantum: "quantum_control",
  corridor: "corridor",
  atphub: "atp_aviation_hub",
  winair: "winair",
  logbookpro: "logbook_pro",
  smartaviation: "smart_aviation",
  mxcommander: "mx_commander",
  safetyculture: "safety_culture",
  aviobook: "aviobook",
  quickbooks: "quickbooks",
  freshbooks: "freshbooks",
};

const ID_BY_PROVIDER = Object.entries(PROVIDER_BY_ID).reduce<Record<string, IntegrationId>>(
  (acc, [id, provider]) => {
    acc[provider] = id as IntegrationId;
    return acc;
  },
  {}
);

interface StoreState {
  records: Map<IntegrationId, IntegrationRecord>;
  loading: boolean;
  loaded: boolean;
}

const _state: StoreState = {
  records: new Map(),
  loading: false,
  loaded: false,
};

const _listeners = new Set<() => void>();
function _notify() {
  _listeners.forEach((listener) => listener());
}

function normalizeRecord(raw: any): IntegrationRecord | null {
  const id = ID_BY_PROVIDER[String(raw?.provider ?? "")];
  if (!id) return null;
  return {
    integrationId: raw?.id,
    provider: raw?.provider,
    status: (raw?.status ?? "disconnected") as IntegrationStatus,
    lastSyncAt: raw?.last_sync_at ? new Date(raw.last_sync_at) : undefined,
    lastSyncStatus: raw?.last_sync_status ?? null,
    lastSyncError: raw?.last_sync_error ?? null,
    aircraftCountSynced: raw?.aircraft_count_synced ?? 0,
    settings: raw?.settings ?? {},
  };
}

async function fetchIntegrations() {
  const res = await fetch("/api/integrations", { cache: "no-store" });
  const payload = await res.json().catch(() => ({ integrations: [] }));
  if (!res.ok) {
    throw new Error(payload?.error ?? "Could not load integrations");
  }

  const nextRecords = new Map<IntegrationId, IntegrationRecord>();
  for (const raw of payload?.integrations ?? []) {
    const normalized = normalizeRecord(raw);
    if (normalized) {
      const id = ID_BY_PROVIDER[normalized.provider];
      nextRecords.set(id, normalized);
    }
  }
  _state.records = nextRecords;
  _state.loaded = true;
}

export const integrationStore = {
  async refresh() {
    if (_state.loading) return;
    _state.loading = true;
    _notify();
    try {
      await fetchIntegrations();
    } finally {
      _state.loading = false;
      _notify();
    }
  },

  async connect(
    id: IntegrationId,
    credentials: Record<string, unknown>,
    settings?: Record<string, unknown>
  ) {
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: PROVIDER_BY_ID[id],
        credentials,
        settings: settings ?? {},
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? `Could not connect ${id}`);
    }
    await this.refresh();
    return payload?.integration ?? null;
  },

  beginOAuth(id: IntegrationId) {
    const provider = PROVIDER_BY_ID[id]
    if (provider !== 'quickbooks' && provider !== 'freshbooks') {
      throw new Error('OAuth connect is only supported for accounting providers')
    }
    window.location.assign(`/api/integrations/oauth/start?provider=${encodeURIComponent(provider)}`)
  },

  async disconnect(id: IntegrationId) {
    const integrationId = this.getIntegrationId(id);
    if (!integrationId) return;
    const res = await fetch(`/api/integrations?id=${encodeURIComponent(integrationId)}`, {
      method: "DELETE",
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? `Could not disconnect ${id}`);
    }
    await this.refresh();
  },

  async testConnection(id: IntegrationId, credentials: Record<string, unknown>) {
    const res = await fetch("/api/integrations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: PROVIDER_BY_ID[id],
        credentials,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? `Could not test ${id}`);
    }
    return payload;
  },

  async triggerSync(id: IntegrationId) {
    const integrationId = this.getIntegrationId(id);
    if (!integrationId) {
      throw new Error("Integration is not connected");
    }
    const res = await fetch(`/api/integrations/${integrationId}/sync`, {
      method: "POST",
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error ?? `Could not sync ${id}`);
    }
    await this.refresh();
    return payload;
  },

  isConnected(id: IntegrationId): boolean {
    return this.getStatus(id) === "connected";
  },

  getStatus(id: IntegrationId): IntegrationStatus {
    return _state.records.get(id)?.status ?? "disconnected";
  },

  getLastSync(id: IntegrationId): Date | undefined {
    return _state.records.get(id)?.lastSyncAt;
  },

  getLastError(id: IntegrationId): string | null {
    return _state.records.get(id)?.lastSyncError ?? null;
  },

  getLastSyncStatus(id: IntegrationId): string | null {
    return _state.records.get(id)?.lastSyncStatus ?? null;
  },

  getIntegrationId(id: IntegrationId): string | undefined {
    return _state.records.get(id)?.integrationId;
  },

  isLoading(): boolean {
    return _state.loading;
  },

  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
};

export function useIntegrationStore() {
  const [, rerender] = useState(0);

  useEffect(() => integrationStore.subscribe(() => rerender((value) => value + 1)), []);

  useEffect(() => {
    if (!_state.loaded && !_state.loading) {
      void integrationStore.refresh();
    }
  }, []);

  return integrationStore;
}
