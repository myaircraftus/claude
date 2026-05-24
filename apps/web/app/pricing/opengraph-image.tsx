import { ImageResponse } from 'next/og'

export const alt = 'myaircraft.us pricing — free for individual owners, $99/aircraft for shops'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function PricingOG() {
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
          <div style={{ fontSize: 28, fontWeight: 700 }}>myaircraft.us · Pricing</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 18, opacity: 0.7, marginBottom: 16, fontWeight: 600 }}>SIMPLE PRICING</div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, marginBottom: 8 }}>
            $0 for owners.
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, color: '#7DD3FC' }}>
            $99/aircraft for shops.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7 }}>
            Unlimited users · Founder's wing pricing · No credit card
          </div>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7, fontWeight: 600 }}>
            myaircraft.us/pricing
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
