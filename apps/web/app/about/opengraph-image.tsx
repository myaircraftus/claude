import { ImageResponse } from 'next/og'

export const alt = 'About myaircraft.us — built by pilots, A&P mechanics, and AI engineers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function AboutOG() {
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
          <div style={{ fontSize: 28, fontWeight: 700 }}>myaircraft.us · About</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 18, opacity: 0.7, marginBottom: 16, fontWeight: 600 }}>WHO WE ARE</div>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, marginBottom: 4 }}>
            Built by pilots.
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, color: '#7DD3FC' }}>
            Built by A&Ps. Built by builders.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7 }}>
            CEO/PPL · CTO/IA · Head of AI · Counsel/Former FAA · VP Sales/CFI
          </div>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7, fontWeight: 600 }}>
            myaircraft.us/about
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
