import type { TrackingAdapter, AircraftLiveState, RecentFlight } from '../types';

export class AdsbExchangeAdapter implements TrackingAdapter {
  private apiKey: string;
  private baseUrl = 'https://adsbexchange-com1.p.rapidapi.com/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com',
    };
  }

  async getAircraftLiveState(registration: string): Promise<AircraftLiveState> {
    try {
      const res = await fetch(`${this.baseUrl}/registration/${registration}/`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`ADS-B Exchange error: ${res.status}`);
      const data = await res.json();
      const ac = data.ac?.[0];
      if (!ac) {
        return {
          aircraftId: '',
          registration,
          provider: 'adsbexchange',
          isLive: false,
          status: 'no_provider',
          syncedAt: new Date().toISOString(),
        };
      }
      return {
        aircraftId: '',
        registration,
        provider: 'adsbexchange',
        hex: ac.hex,
        callsign: ac.flight?.trim(),
        isLive: true,
        status: 'live_now',
        latitude: ac.lat,
        longitude: ac.lon,
        altitudeFt: ac.alt_baro,
        groundspeedKts: ac.gs,
        headingDeg: ac.track,
        lastSeenAt: new Date().toISOString(),
        providerLink: `https://globe.adsbexchange.com/?icao=${ac.hex}`,
        embedUrl: `https://globe.adsbexchange.com/?icao=${ac.hex}&zoom=9`,
        raw: ac,
        syncedAt: new Date().toISOString(),
      };
    } catch {
      return {
        aircraftId: '',
        registration,
        provider: 'adsbexchange',
        isLive: false,
        status: 'unavailable',
        syncedAt: new Date().toISOString(),
      };
    }
  }

  async getRecentFlights(_registration: string, _limit: number): Promise<RecentFlight[]> {
    // ADS-B Exchange doesn't provide historical flight lists via free tier
    return [];
  }

  async getFlightDetails(_flightId: string): Promise<RecentFlight | null> {
    return null;
  }

  getProviderEmbedUrl(registration: string): string {
    return `https://globe.adsbexchange.com/?reg=${registration}&zoom=9`;
  }

  async refreshAircraftTracking(_registration: string): Promise<void> {
    // pull-based
  }
}
