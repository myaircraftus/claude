import { ImageResponse } from 'next/og'

export const alt = 'myaircraft.us — AI-powered aircraft records intelligence for owners and A&P mechanics'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Homepage OG image — the link-preview card that surfaces on iMessage,
 * WhatsApp, Slack, LinkedIn, Twitter/X, Facebook, Discord, etc. whenever
 * someone shares https://www.myaircraft.us/.
 *
 * Designed to communicate at-a-glance what the product is in <2 seconds:
 *   - Logo + brand wordmark (left of center)
 *   - One-line headline ("Your aircraft's entire history. AI-readable.")
 *   - 3 capability pills (logbook AI, AD compliance, owner ↔ A&P chat)
 *   - Trust footer (free for owners, SOC2 in progress, US-based)
 *
 * Renders via Satori → PNG at request time. Cached by Vercel + the CDN.
 */
export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 70,
          background: 'linear-gradient(135deg, #0A1628 0%, #1E3A5F 60%, #2563EB 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top — logomark + brand */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              width: 64,
              height: 64,
              borderRadius: 20,
              background: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0A1628',
              fontSize: 38,
              fontWeight: 900,
              marginRight: 18,
            }}
          >
            m
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px' }}>
              myaircraft.us
            </div>
            <div style={{ fontSize: 16, opacity: 0.7, marginTop: 2 }}>
              Aircraft Records Intelligence
            </div>
          </div>
        </div>

        {/* Middle — headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-1.5px',
              maxWidth: 1060,
            }}
          >
            Your aircraft's entire history.
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-1.5px',
              color: '#7DD3FC',
              marginTop: 4,
            }}
          >
            AI-readable. Searchable. Audit-proof.
          </div>
        </div>

        {/* Capability strip */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
              fontSize: 18,
              fontWeight: 600,
              marginRight: 14,
            }}
          >
            AI logbook reader
          </div>
          <div
            style={{
              display: 'flex',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
              fontSize: 18,
              fontWeight: 600,
              marginRight: 14,
            }}
          >
            AD compliance tracker
          </div>
          <div
            style={{
              display: 'flex',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Owner ↔ A&P chat
          </div>
        </div>

        {/* Bottom — trust signals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 18, opacity: 0.75, fontWeight: 500 }}>
            Free for individual owners · SOC 2 in progress · Built in the US
          </div>
          <div style={{ display: 'flex', fontSize: 18, opacity: 0.75, fontWeight: 600 }}>
            myaircraft.us
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
