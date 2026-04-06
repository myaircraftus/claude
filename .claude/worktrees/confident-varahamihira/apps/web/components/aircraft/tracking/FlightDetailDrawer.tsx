'use client';

import { X, ExternalLink, Plane, Clock, MapPin, Gauge, Navigation, Copy } from 'lucide-react';
import type { RecentFlight } from '@/lib/tracking/types';

interface FlightDetailDrawerProps {
  flight: RecentFlight;
  onClose: () => void;
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(minutes?: number) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function DetailCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: JSX.Element;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-foreground capitalize">{value}</span>
    </div>
  );
}

export function FlightDetailDrawer({ flight, onClose }: FlightDetailDrawerProps) {
  const showAdminRaw =
    process.env.NEXT_PUBLIC_ENABLE_TRACKING_ADMIN_RAW_PAYLOAD === 'true';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">
              {flight.origin || '???'} &rarr; {flight.destination || '???'}
            </h3>
            <p className="text-[12px] text-muted-foreground">
              {flight.registration} &middot; {flight.callsign || flight.providerFlightId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Route summary */}
          <div className="flex items-center justify-center gap-3 py-4 bg-muted/30 rounded-xl">
            <div className="text-center">
              <div className="text-[22px] font-bold text-foreground">
                {flight.origin || '???'}
              </div>
              <div className="text-[11px] text-muted-foreground">Origin</div>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <Plane className="w-4 h-4 text-[#0c2d6b] rotate-90" />
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="text-center">
              <div className="text-[22px] font-bold text-foreground">
                {flight.destination || '???'}
              </div>
              <div className="text-[11px] text-muted-foreground">Destination</div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <DetailCell
              label="Departed"
              value={formatDateTime(flight.departedAt)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Arrived"
              value={formatDateTime(flight.arrivedAt)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Duration"
              value={formatDuration(flight.durationMinutes)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Status"
              value={flight.status || '—'}
              icon={<MapPin className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Max Altitude"
              value={flight.maxAltitudeFt ? `${flight.maxAltitudeFt.toLocaleString()} ft` : '—'}
              icon={<Navigation className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Avg Speed"
              value={flight.avgGroundspeedKts ? `${flight.avgGroundspeedKts} kts` : '—'}
              icon={<Gauge className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Callsign"
              value={flight.callsign || '—'}
              icon={<Plane className="w-3.5 h-3.5" />}
            />
            <DetailCell
              label="Provider"
              value={flight.provider}
              icon={<MapPin className="w-3.5 h-3.5" />}
            />
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {flight.providerLink && (
              <a
                href={flight.providerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in {flight.provider}
              </a>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(flight.providerFlightId)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Flight ID
            </button>
          </div>

          {/* Admin raw payload */}
          {showAdminRaw && flight.raw != null && (
            <details className="bg-muted/30 rounded-lg p-3">
              <summary className="text-[12px] font-medium text-muted-foreground cursor-pointer">
                Raw provider payload (admin)
              </summary>
              <pre className="text-[11px] text-muted-foreground mt-2 overflow-x-auto">
                {JSON.stringify(flight.raw, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
