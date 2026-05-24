import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * Apple touch icon — used by iOS Safari "Add to Home Screen", iMessage
 * link previews on iPhone (alongside og:image), and Safari macOS pinned
 * tabs. 180×180 PNG with the brand mark on the gradient.
 *
 * Critical for the iMessage share-banner the user requested. iOS renders
 * this as the small thumbnail on the LEFT of the link card; the og:image
 * is the larger hero. Together they give a polished link-unfurl.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0A1628 0%, #1E3A5F 60%, #2563EB 100%)',
          color: 'white',
          fontSize: 110,
          fontWeight: 900,
          fontFamily: 'sans-serif',
          letterSpacing: '-4px',
        }}
      >
        m
      </div>
    ),
    { ...size }
  )
}
