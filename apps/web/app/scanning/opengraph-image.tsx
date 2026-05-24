import { ImageResponse } from 'next/og'

export const alt = 'Free aircraft logbook scanning — we ship a box, you ship logbooks, we deliver searchable records'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function ScanningOG() {
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
          <div style={{ fontSize: 28, fontWeight: 700 }}>myaircraft.us · Logbook scanning</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 18, opacity: 0.7, marginBottom: 16, fontWeight: 600 }}>FREE WHITE-GLOVE SCANNING</div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.08, marginBottom: 4 }}>
            We ship the box.
          </div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.08 }}>
            You ship the logbooks.
          </div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.08, color: '#7DD3FC', marginTop: 4 }}>
            We do the AI extraction.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7 }}>
            48-hour turnaround · Searchable in 24 hrs · Insured shipping
          </div>
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7, fontWeight: 600 }}>
            myaircraft.us/scanning
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
