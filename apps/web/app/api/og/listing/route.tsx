import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const NAVY = '#1B2B5E';
const BLUE = '#2563EB';
const GREEN = '#059669';
const GRAY = '#64748B';

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get('title') || 'Aircraft Part';
  const condition = searchParams.get('condition') || 'Used';
  const price = searchParams.get('price') || 'Contact for price';
  const location = searchParams.get('location') || 'United States';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: NAVY,
          padding: '64px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            background: '#FFFFFF',
            borderRadius: '28px',
            padding: '64px',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'flex-start',
                padding: '10px 22px',
                borderRadius: '999px',
                background: '#ECFDF5',
                color: GREEN,
                fontSize: '26px',
                fontWeight: 600,
              }}
            >
              {condition}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: '36px',
                fontSize: '68px',
                fontWeight: 700,
                color: NAVY,
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '64px',
                fontWeight: 700,
                color: BLUE,
              }}
            >
              {price}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '32px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: '30px',
                  color: GRAY,
                }}
              >
                {location}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '30px',
                  fontWeight: 700,
                  color: NAVY,
                }}
              >
                myaircraft
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
