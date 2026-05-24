import { ImageResponse } from 'next/og'

export const alt = 'myaircraft.us features — AI logbook reader, AD compliance, owner ↔ A&P chat, work orders'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function FeaturesOG() {
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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>myaircraft.us · Features</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 18, opacity: 0.7, marginBottom: 16, fontWeight: 600 }}>EVERYTHING IN ONE PLACE</div>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, marginBottom: 4 }}>
            27 features. One platform.
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, color: '#7DD3FC' }}>
            From logbook to landing fee.
          </div>
        </div>

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
            AI logbook ingestion
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
            Work-order flow
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
