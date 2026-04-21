import { ImageResponse } from 'next/og'

export const alt = 'myaircraft.us - Aircraft Records Intelligence'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: '-2px' }}>
          myaircraft.us
        </div>
        <div style={{ fontSize: 36, marginTop: 24, opacity: 0.8 }}>
          Aircraft Records Intelligence
        </div>
      </div>
    ),
    { ...size }
  )
}
