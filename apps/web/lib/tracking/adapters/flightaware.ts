import type { TrackingAdapter, AircraftLiveState, RecentFlight } from '../types';

export class FlightAwareAdapter implements TrackingAdapter {
  private apiKey: string;
  private baseUrl = 'https://aeroapi.flightaware.com/aeroapi';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return { 'x-apikey': this.apiKey, 'Content-Type': 'application/json' };
  }

  async getAircraftLiveState(registration: string): Promise<AircraftLiveState> {
    try {
      const res = await fetch(`${this.baseUrl}/flights/${registration}?max_pages=1`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`FlightAware API error: ${res.status}`);
      const data = await res.json();
      const flight = data.flights?.[0];
      if (!flight) {
        return {
          aircraftId: '',
          registration,
          provider: 'flightaware',
          isLive: false,
          status: 'no_provider',
          syncedAt: new Date().toISOString(),
        };
      }
      const isLive = flight.progress_percent != null && flight.progress_percent < 100;
      return {
        aircraftId: '',
        registration,
        provider: 'flightaware',
        callsign: flight.ident,
        isLive,
        status: isLive ? 'live_now' : 'recently_active',
        departedAirport: flight.origin?.code,
        arrivalAirport: flight.destination?.code,
        currentFlightId: flight.fa_flight_id,
        providerLink: `https://flightaware.com/live/flight/${registration}`,
        raw: flight,
        syncedAt: new Date().toISOString(),
      };
    } catch {
      return {
        aircraftId: '',
        registration,
        provider: 'flightaware',
        isLive: false,
        status: 'unavailable',
        syncedAt: new Date().toISOString(),
      };
    }
  }

  async getRecentFlights(registration: string, limit: number): Promise<RecentFlight[]> {
    try {
      const res = await fetch(`${this.baseUrl}/flights/${registration}?max_pages=1`, {
        headers: this.headers,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.flights || []).slice(0, limit).map((f: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        aircraftId: '',
        registration,
        provider: 'flightaware' as const,
        providerFlightId: f.fa_flight_id as string,
        callsign: f.ident as string,
        origin: (f.origin as Record<string, string>)?.code,
        destination: (f.destination as Record<string, string>)?.code,
        departedAt: f.actual_off as string,
        arrivedAt: f.actual_on as string,
        status: f.status as string,
        providerLink: `https://flightaware.com/live/flight/id/${f.fa_flight_id}`,
        raw: f,
        syncedAt: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async getFlightDetails(flightId: string): Promise<RecentFlight | null> {
    try {
      const res = await fetch(`${this.baseUrl}/flights/${flightId}`, {
        headers: this.headers,
      });
      if (!res.ok) return null;
      const f = await res.json();
      return {
        id: crypto.randomUUID(),
        aircraftId: '',
        registration: f.registration || '',
        provider: 'flightaware',
        providerFlightId: f.fa_flight_id,
        callsign: f.ident,
        origin: f.origin?.code,
        destination: f.destination?.code,
        departedAt: f.actual_off,
        arrivedAt: f.actual_on,
        status: f.status,
        raw: f,
        syncedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  getProviderEmbedUrl(registration: string): string {
    return `https://flightaware.com/live/flight/${registration}/redirect`;
  }

  async refreshAircraftTracking(_registration: string): Promise<void> {
    // FlightAware is pull-based, no refresh needed
  }
}
