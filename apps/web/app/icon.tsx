import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/**
 * Browser favicon. Renders a tiny brand mark — white "m" on the brand
 * gradient — at 32×32 PNG. Replaces the SVG favicon that Safari and some
 * older browsers don't render reliably in tabs.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A1628 0%, #2563EB 100%)',
          color: 'white',
          fontSize: 22,
          fontWeight: 900,
          fontFamily: 'sans-serif',
          borderRadius: 6,
        }}
      >
        m
      </div>
    ),
    { ...size }
  )
}
