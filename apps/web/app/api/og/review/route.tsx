import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const NAVY = '#1B2B5E';
const AMBER = '#D97706';
const GRAY = '#64748B';

export function GET(request: Request) {
  // `token` is read for routing/validation upstream but is intentionally
  // never rendered into the image.
  const { searchParams } = new URL(request.url);
  void searchParams.get('token');

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
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: '#FFFFFF',
            borderRadius: '28px',
            padding: '64px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: '60px',
              fontWeight: 700,
              color: NAVY,
              textAlign: 'center',
              lineHeight: 1.15,
            }}
          >
            You&apos;ve been asked to leave a review
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '44px',
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  fontSize: '72px',
                  marginRight: i < 4 ? '12px' : '0px',
                  color: AMBER,
                }}
              >
                ☆
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: '40px',
              fontSize: '30px',
              color: GRAY,
              textAlign: 'center',
            }}
          >
            Your feedback helps the general aviation community
          </div>

          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: '88px',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '40px',
                height: '6px',
                borderRadius: '3px',
                background: '#2563EB',
                marginRight: '16px',
              }}
            />
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
            <div
              style={{
                display: 'flex',
                width: '40px',
                height: '6px',
                borderRadius: '3px',
                background: '#2563EB',
                marginLeft: '16px',
              }}
            />
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
