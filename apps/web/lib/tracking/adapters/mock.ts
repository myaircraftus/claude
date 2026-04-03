// MockTrackingAdapter — dev/demo mode, provides realistic fake data for N636SA
import type { TrackingAdapter, AircraftLiveState, RecentFlight } from '../types';

const MOCK_FLIGHTS: RecentFlight[] = [
  {
    id: 'mock-flight-1',
    aircraftId: '',
    registration: 'N636SA',
    provider: 'mock',
    providerFlightId: 'MOCK-001',
    callsign: 'N636SA',
    origin: 'KCCR',
    destination: 'KSFO',
    departedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
    durationMinutes: 45,
    maxAltitudeFt: 3500,
    avgGroundspeedKts: 120,
    status: 'completed',
    syncedAt: new Date().toISOString(),
  },
  {
    id: 'mock-flight-2',
    aircraftId: '',
    registration: 'N636SA',
    provider: 'mock',
    providerFlightId: 'MOCK-002',
    callsign: 'N636SA',
    origin: 'KSFO',
    destination: 'KMOD',
    departedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
    durationMinutes: 90,
    maxAltitudeFt: 6500,
    avgGroundspeedKts: 135,
    status: 'completed',
    syncedAt: new Date().toISOString(),
  },
  {
    id: 'mock-flight-3',
    aircraftId: '',
    registration: 'N636SA',
    provider: 'mock',
    providerFlightId: 'MOCK-003',
    callsign: 'N636SA',
    origin: 'KMOD',
    destination: 'KCCR',
    departedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 75 * 60 * 1000).toISOString(),
    durationMinutes: 75,
    maxAltitudeFt: 5500,
    avgGroundspeedKts: 128,
    status: 'completed',
    syncedAt: new Date().toISOString(),
  },
  {
    id: 'mock-flight-4',
    aircraftId: '',
    registration: 'N636SA',
    provider: 'mock',
    providerFlightId: 'MOCK-004',
    callsign: 'N636SA',
    origin: 'KCCR',
    destination: 'KLVK',
    departedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000).toISOString(),
    durationMinutes: 25,
    maxAltitudeFt: 2500,
    avgGroundspeedKts: 110,
    status: 'completed',
    syncedAt: new Date().toISOString(),
  },
  {
    id: 'mock-flight-5',
    aircraftId: '',
    registration: 'N636SA',
    provider: 'mock',
    providerFlightId: 'MOCK-005',
    callsign: 'N636SA',
    origin: 'KLVK',
    destination: 'KCCR',
    departedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    arrivedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    durationMinutes: 30,
    maxAltitudeFt: 2000,
    avgGroundspeedKts: 115,
    status: 'completed',
    syncedAt: new Date().toISOString(),
  },
];

export class MockTrackingAdapter implements TrackingAdapter {
  async getAircraftLiveState(registration: string): Promise<AircraftLiveState> {
    return {
      aircraftId: '',
      registration,
      provider: 'mock',
      isLive: false,
      status: 'recently_active',
      lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      syncedAt: new Date().toISOString(),
    };
  }

  async getRecentFlights(registration: string, limit: number): Promise<RecentFlight[]> {
    return MOCK_FLIGHTS.slice(0, limit).map(f => ({ ...f, registration }));
  }

  async getFlightDetails(flightId: string): Promise<RecentFlight | null> {
    return MOCK_FLIGHTS.find(f => f.providerFlightId === flightId) || null;
  }

  getProviderEmbedUrl(_registration: string): string | null {
    return null;
  }

  async refreshAircraftTracking(_registration: string): Promise<void> {
    // no-op in mock
  }
}
