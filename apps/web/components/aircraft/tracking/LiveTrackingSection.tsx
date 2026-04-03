'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plane,
  RefreshCw,
  ExternalLink,
  Radio,
  Clock,
  MapPin,
  Gauge,
  Navigation,
  ChevronRight,
  Settings,
  List,
  Eye,
} from 'lucide-react';
import type { AircraftLiveState, RecentFlight, TrackingProviderConfig } from '@/lib/tracking/types';
import { FlightDetailDrawer } from './FlightDetailDrawer';
import { ProviderSettingsTab } from './ProviderSettingsTab';

interface LiveTrackingSectionProps {
  aircraftId: string;
  registration: string;
  enabled: boolean; // ENABLE_AIRCRAFT_LIVE_TRACKING feature flag
}

type Tab = 'live' | 'flights' | 'settings';

function StatusChip({ status }: { status: AircraftLiveState['status'] }) {
  const configs: Record<string, { label: string; classes: string }> = {
    live_now: {
      label: 'Live Now',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    recently_active: {
      label: 'Recently Active',
      classes: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    no_provider: {
      label: 'No Live Provider',
      classes: 'bg-gray-50 text-gray-600 border-gray-200',
    },
    unavailable: {
      label: 'Provider Unavailable',
      classes: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  };
  const c = configs[status] ?? configs.no_provider;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${c.classes}`}
    >
      {status === 'live_now' && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {c.label}
    </span>
  );
}

function formatDuration(minutes?: number) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function LiveTrackingSection({
  aircraftId,
  registration,
  enabled,
}: LiveTrackingSectionProps) {
  const [tab, setTab] = useState<Tab>('live');
  const [liveState, setLiveState] = useState<AircraftLiveState | null>(null);
  const [flights, setFlights] = useState<RecentFlight[]>([]);
  const [config, setConfig] = useState<TrackingProviderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<RecentFlight | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLiveState = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/tracking/live`);
      if (res.ok) {
        const data = await res.json();
        setLiveState(data.state);
        setLastSync(new Date().toISOString());
      }
    } catch {
      // silent fail
    }
  }, [aircraftId, enabled]);

  const fetchFlights = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/tracking/recent?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights || []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [aircraftId, enabled]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/tracking/provider-config`);
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
      }
    } catch {
      // silent fail
    }
  }, [aircraftId]);

  useEffect(() => {
    if (!enabled) return;
    fetchLiveState();
    fetchFlights();
    fetchConfig();
    // Poll every 90 seconds when on live tab
    const interval = setInterval(() => {
      if (tab === 'live') fetchLiveState();
    }, 90000);
    return () => clearInterval(interval);
  }, [enabled, tab, fetchLiveState, fetchFlights, fetchConfig]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/aircraft/${aircraftId}/tracking/refresh`, { method: 'POST' });
      await fetchLiveState();
      await fetchFlights();
    } finally {
      setRefreshing(false);
    }
  };

  if (!enabled) return null;

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'live', label: 'Live View', icon: <Radio className="w-3.5 h-3.5" /> },
    { id: 'flights', label: 'Recent Flights', icon: <List className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Provider Settings', icon: <Settings className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0c2d6b]/10 flex items-center justify-center">
            <Plane className="w-4 h-4 text-[#0c2d6b]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">Live Tracking</h3>
            {lastSync && (
              <p className="text-[11px] text-muted-foreground">
                Last sync: {new Date(lastSync).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {liveState && <StatusChip status={liveState.status} />}
          {config?.provider && config.provider !== 'none' && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted px-2 py-1 rounded">
              {config.provider}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh tracking data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-[#0c2d6b] text-[#0c2d6b]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {tab === 'live' && (
          <LiveViewTab
            liveState={liveState}
            registration={registration}
            config={config}
          />
        )}
        {tab === 'flights' && (
          <RecentFlightsTab
            flights={flights}
            loading={loading}
            onSelectFlight={setSelectedFlight}
          />
        )}
        {tab === 'settings' && (
          <ProviderSettingsTab
            aircraftId={aircraftId}
            config={config}
            onUpdate={setConfig}
          />
        )}
      </div>

      {/* Flight Detail Drawer */}
      {selectedFlight && (
        <FlightDetailDrawer
          flight={selectedFlight}
          onClose={() => setSelectedFlight(null)}
        />
      )}
    </div>
  );
}

function LiveStatCell({ label, value, icon }: { label: string; value: string; icon: JSX.Element }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-foreground">{value}</span>
    </div>
  );
}

function LiveViewTab({
  liveState,
  registration,
  config,
}: {
  liveState: AircraftLiveState | null;
  registration: string;
  config: TrackingProviderConfig | null;
}) {
  const embedEnabled =
    config?.embedEnabled &&
    process.env.NEXT_PUBLIC_ENABLE_TRACKING_EMBED === 'true';

  if (!liveState || liveState.status === 'no_provider') {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Radio className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-[14px] font-medium text-foreground mb-1">
          No live tracking provider linked yet
        </p>
        <p className="text-[12px] text-muted-foreground mb-4">
          Connect FlightAware or ADS-B Exchange to see live position data
        </p>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0c2d6b]">
          <Settings className="w-3.5 h-3.5" />
          Switch to Provider Settings to connect
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live embed or placeholder */}
      {embedEnabled && liveState.embedUrl ? (
        <div className="rounded-xl overflow-hidden border border-border bg-muted h-48">
          <iframe
            src={liveState.embedUrl}
            className="w-full h-full"
            title={`Live tracking for ${registration}`}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <div className="rounded-xl bg-muted/50 border border-border p-4 h-32 flex items-center justify-center">
          <div className="text-center">
            <Eye className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-[12px] text-muted-foreground">Map embed not enabled</p>
            {liveState.providerLink && (
              <a
                href={liveState.providerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#0c2d6b] hover:underline mt-1 inline-flex items-center gap-1"
              >
                Open in {liveState.provider} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LiveStatCell label="Tail" value={registration} icon={<Plane className="w-3.5 h-3.5" />} />
        <LiveStatCell label="Callsign" value={liveState.callsign || '—'} icon={<Radio className="w-3.5 h-3.5" />} />
        <LiveStatCell
          label="Last Seen"
          value={liveState.lastSeenAt ? new Date(liveState.lastSeenAt).toLocaleTimeString() : '—'}
          icon={<Clock className="w-3.5 h-3.5" />}
        />
        <LiveStatCell label="Source" value={liveState.provider} icon={<MapPin className="w-3.5 h-3.5" />} />
        {liveState.altitudeFt != null && (
          <LiveStatCell
            label="Altitude"
            value={`${liveState.altitudeFt.toLocaleString()} ft`}
            icon={<Navigation className="w-3.5 h-3.5" />}
          />
        )}
        {liveState.groundspeedKts != null && (
          <LiveStatCell
            label="Ground Speed"
            value={`${liveState.groundspeedKts} kts`}
            icon={<Gauge className="w-3.5 h-3.5" />}
          />
        )}
      </div>

      {/* Provider link */}
      {liveState.providerLink && (
        <a
          href={liveState.providerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors py-2 border border-border rounded-lg"
        >
          Open in {liveState.provider} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function RecentFlightsTab({
  flights,
  loading,
  onSelectFlight,
}: {
  flights: RecentFlight[];
  loading: boolean;
  onSelectFlight: (f: RecentFlight) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flights.length) {
    return (
      <div className="text-center py-10">
        <Plane className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
        <p className="text-[13px] text-muted-foreground">No recent flights found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_1fr_80px_80px_80px] gap-3 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>From &rarr; To</span>
        <span>Date</span>
        <span>Duration</span>
        <span>Max Alt</span>
        <span>Speed</span>
      </div>
      {flights.map(flight => (
        <button
          key={flight.id}
          onClick={() => onSelectFlight(flight)}
          className="w-full grid grid-cols-[1fr_1fr_80px_80px_80px] gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left items-center group"
        >
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-semibold text-foreground">
              {flight.origin || '???'} &rarr; {flight.destination || '???'}
            </div>
            {flight.callsign && (
              <span className="text-[10px] text-muted-foreground">{flight.callsign}</span>
            )}
          </div>
          <div className="text-[12px] text-muted-foreground">{formatDate(flight.departedAt)}</div>
          <div className="text-[12px] text-foreground">{formatDuration(flight.durationMinutes)}</div>
          <div className="text-[12px] text-foreground">
            {flight.maxAltitudeFt ? `${flight.maxAltitudeFt.toLocaleString()} ft` : '—'}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-foreground">
              {flight.avgGroundspeedKts ? `${flight.avgGroundspeedKts} kt` : '—'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      ))}
    </div>
  );
}
