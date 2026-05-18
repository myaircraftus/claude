import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const NAVY = '#1B2B5E';
const GRAY = '#64748B';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: '120px',
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '-3px',
          }}
        >
          myaircraft
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '24px',
            fontSize: '36px',
            fontWeight: 400,
            color: '#C7D0E8',
          }}
        >
          The Operations Platform for General Aviation
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: '56px',
            width: '120px',
            height: '6px',
            borderRadius: '3px',
            background: '#2563EB',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '40px',
            fontSize: '22px',
            color: GRAY,
          }}
        >
          myaircraft.us
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
