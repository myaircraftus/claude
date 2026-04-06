import { FlightAwareAdapter } from './adapters/flightaware';
import { AdsbExchangeAdapter } from './adapters/adsbexchange';
import { MockTrackingAdapter } from './adapters/mock';
import type { TrackingAdapter, TrackingProvider } from './types';

export function createTrackingAdapter(provider: TrackingProvider): TrackingAdapter {
  switch (provider) {
    case 'flightaware': {
      const key = process.env.FLIGHTAWARE_API_KEY;
      if (!key) throw new Error('FLIGHTAWARE_API_KEY not set');
      return new FlightAwareAdapter(key);
    }
    case 'adsbexchange': {
      const key = process.env.ADSBEXCHANGE_API_KEY;
      if (!key) throw new Error('ADSBEXCHANGE_API_KEY not set');
      return new AdsbExchangeAdapter(key);
    }
    case 'mock':
    default:
      return new MockTrackingAdapter();
  }
}
