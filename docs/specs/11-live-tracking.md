# Spec 11 — Live Tracking / Recent Flights

## Goal
Add a "Live Tracking / Recent Flights" capability to each aircraft page. Additive only — never break existing flows.

## Feature Flags (all default OFF)
- ENABLE_AIRCRAFT_LIVE_TRACKING
- ENABLE_FLIGHTAWARE_PROVIDER
- ENABLE_ADSBEXCHANGE_PROVIDER
- ENABLE_TRACKING_EMBED
- ENABLE_TRACKING_ADMIN_RAW_PAYLOAD

## UI: Aircraft Page Addition
- Section: "Live Tracking" placed under "Operations sync and current usage"
- Provider badge top-right
- Last sync timestamp
- Status chip: Live now | Recently active | No live provider linked | Provider unavailable
- Tabbed card with 3 tabs: Live View | Recent Flights | Provider Settings

### Live View Tab
- Embedded provider panel / iframe-style webview
- Providers: flightaware | adsbexchange | none
- Empty state: "No live tracking provider linked yet" + Connect Provider button
- "Open in provider" external link
- Info row: tail number, ICAO/hex, last position time, source provider
- Poll every 60–120s when enabled

### Recent Flights Tab
Columns: Date | Flight ID/Callsign | From | To | Departure | Arrival | Duration | Max Altitude | Avg Speed | Status | Source
- Row click → flight detail drawer/modal
- CSV export nice-to-have

### Flight Detail Drawer
- Tail, callsign, provider, departure/arrival, off/on times, route summary, altitude/speed summary
- Raw provider payload (admin only, collapsible)
- Actions: Refresh from provider | Save evidence note | Copy provider link

### Provider Settings Tab
- Linked provider
- Embed enabled toggle
- Structured sync enabled toggle
- Use as ops signal source toggle
- Sync cadence
- Source priority
- Note: reviewed maintenance evidence > provider telemetry

## Provider Adapter Layer
Interface:
- getAircraftLiveState(registration)
- getRecentFlights(registration, limit, cursor?)
- getFlightDetails(flightId)
- getProviderEmbedUrl(registration)
- refreshAircraftTracking(registration)

Adapters:
- FlightAwareAdapter
- AdsbExchangeAdapter
- MockTrackingAdapter (dev/demo)

## Normalized Types
### AircraftLiveState
aircraftId, registration, provider, providerAircraftId, hex, callsign, isLive, status, latitude, longitude, altitudeFt, groundspeedKts, headingDeg, lastSeenAt, departedAirport, arrivalAirport, currentFlightId, providerLink, embedUrl, raw

### RecentFlight
id, aircraftId, registration, provider, providerFlightId, callsign, origin, destination, departedAt, arrivedAt, durationMinutes, maxAltitudeFt, avgGroundspeedKts, lastGroundspeedKts, status, providerLink, raw

## Database Tables (Migration 018)
- aircraft_tracking_provider_config
- aircraft_live_state
- aircraft_recent_flights
- flight_track_points
- flight_sync_logs

## API Routes
- GET /api/aircraft/:id/tracking/live
- GET /api/aircraft/:id/tracking/recent
- GET /api/aircraft/:id/tracking/flights/:flightId
- POST /api/aircraft/:id/tracking/refresh
- GET /api/aircraft/:id/tracking/provider-config
- PATCH /api/aircraft/:id/tracking/provider-config

All server-side only. No provider keys in client. Fail gracefully.

## Env Vars Needed
- FLIGHTAWARE_API_KEY
- ADSBEXCHANGE_API_KEY
- ENABLE_AIRCRAFT_LIVE_TRACKING=true (to enable)

## Demo / Seed
- N636SA: 5–10 mock recent flights in dev mode when no provider configured

## Reconciliation
- Provider telemetry = lower priority signal than reviewed maintenance evidence
- Show conflicts, never silently overwrite
- Preserve existing ledger philosophy

## Guardrails
- Do NOT remove existing features
- Do NOT break aircraft detail routing
- No secrets client-side
- Additive and feature-flagged only
