export type TrackingStatus = 'live_now' | 'recently_active' | 'no_provider' | 'unavailable';
export type TrackingProvider = 'flightaware' | 'adsbexchange' | 'mock' | 'none';
export type SyncType = 'live_state' | 'recent_flights' | 'flight_detail';

export interface AircraftLiveState {
  aircraftId: string;
  registration: string;
  provider: TrackingProvider;
  providerAircraftId?: string;
  hex?: string;
  callsign?: string;
  isLive: boolean;
  status: TrackingStatus;
  latitude?: number;
  longitude?: number;
  altitudeFt?: number;
  groundspeedKts?: number;
  headingDeg?: number;
  lastSeenAt?: string;
  departedAirport?: string;
  arrivalAirport?: string;
  currentFlightId?: string;
  providerLink?: string;
  embedUrl?: string;
  raw?: unknown;
  syncedAt: string;
}

export interface RecentFlight {
  id: string;
  aircraftId: string;
  registration: string;
  provider: TrackingProvider;
  providerFlightId: string;
  callsign?: string;
  origin?: string;
  destination?: string;
  departedAt?: string;
  arrivedAt?: string;
  durationMinutes?: number;
  maxAltitudeFt?: number;
  avgGroundspeedKts?: number;
  lastGroundspeedKts?: number;
  status?: string;
  providerLink?: string;
  raw?: unknown;
  syncedAt: string;
}

export interface TrackingProviderConfig {
  aircraftId: string;
  provider: TrackingProvider;
  providerAircraftId?: string;
  embedEnabled: boolean;
  structuredSyncEnabled: boolean;
  useAsOpsSignal: boolean;
  syncCadenceSeconds: number;
  sourcePriority: number;
}

export interface TrackingAdapter {
  getAircraftLiveState(registration: string): Promise<AircraftLiveState>;
  getRecentFlights(registration: string, limit: number, cursor?: string): Promise<RecentFlight[]>;
  getFlightDetails(flightId: string): Promise<RecentFlight | null>;
  getProviderEmbedUrl(registration: string): string | null;
  refreshAircraftTracking(registration: string): Promise<void>;
}
