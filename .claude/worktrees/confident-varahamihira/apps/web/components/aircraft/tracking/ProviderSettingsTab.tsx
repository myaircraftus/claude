'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import type { TrackingProviderConfig } from '@/lib/tracking/types';

interface ProviderSettingsTabProps {
  aircraftId: string;
  config: TrackingProviderConfig | null;
  onUpdate: (config: TrackingProviderConfig) => void;
}

export function ProviderSettingsTab({ aircraftId, config, onUpdate }: ProviderSettingsTabProps) {
  const [provider, setProvider] = useState(config?.provider || 'none');
  const [embedEnabled, setEmbedEnabled] = useState(config?.embedEnabled ?? false);
  const [structuredSync, setStructuredSync] = useState(config?.structuredSyncEnabled ?? false);
  const [useAsOps, setUseAsOps] = useState(config?.useAsOpsSignal ?? false);
  const [syncCadence, setSyncCadence] = useState(config?.syncCadenceSeconds ?? 120);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/tracking/provider-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          embedEnabled,
          structuredSyncEnabled: structuredSync,
          useAsOpsSignal: useAsOps,
          syncCadenceSeconds: syncCadence,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({
    checked,
    onChange,
    label,
    description,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-[#0c2d6b]' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Provider selection */}
      <div>
        <label className="block text-[12px] font-medium text-foreground mb-2">
          Tracking Provider
        </label>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value as 'flightaware' | 'adsbexchange' | 'none')}
          className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-2 focus:ring-[#0c2d6b]/20 focus:border-[#0c2d6b] outline-none"
        >
          <option value="none">No provider</option>
          <option value="flightaware">FlightAware</option>
          <option value="adsbexchange">ADS-B Exchange</option>
        </select>
      </div>

      {/* Toggles */}
      <div className="bg-muted/30 rounded-xl px-4">
        <Toggle
          checked={embedEnabled}
          onChange={setEmbedEnabled}
          label="Embed live map"
          description="Show provider map iframe in Live View"
        />
        <Toggle
          checked={structuredSync}
          onChange={setStructuredSync}
          label="Structured sync"
          description="Sync flight data to database for search/queries"
        />
        <Toggle
          checked={useAsOps}
          onChange={setUseAsOps}
          label="Use as operations signal source"
          description="Allow flight data to inform tach/time estimates"
        />
      </div>

      {/* Sync cadence */}
      <div>
        <label className="block text-[12px] font-medium text-foreground mb-2">
          Sync cadence: {syncCadence}s
        </label>
        <input
          type="range"
          min={60}
          max={600}
          step={30}
          value={syncCadence}
          onChange={e => setSyncCadence(parseInt(e.target.value))}
          className="w-full accent-[#0c2d6b]"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>60s (faster)</span>
          <span>600s (slower)</span>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-700">
        Note: Reviewed maintenance evidence takes priority over provider telemetry. Conflicts will
        be shown, never silently overwritten.
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#0c2d6b] text-white text-[13px] font-medium hover:bg-[#0c2d6b]/90 transition-colors disabled:opacity-50"
      >
        <Save className="w-3.5 h-3.5" />
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
