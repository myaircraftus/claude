import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const NAVY = '#1B2B5E';
const GREEN = '#059669';
const AMBER = '#D97706';
const GRAY = '#64748B';

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const name = searchParams.get('name') || 'myaircraft Seller';
  const sales = searchParams.get('sales') || '0';

  const ratingRaw = Number.parseFloat(searchParams.get('rating') || '0');
  const rating = Number.isFinite(ratingRaw)
    ? Math.max(0, Math.min(5, ratingRaw))
    : 0;
  const filledStars = Math.round(rating);

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
            width: '100%',
            height: '100%',
            background: '#FFFFFF',
            borderRadius: '28px',
            padding: '64px',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 24px',
              borderRadius: '999px',
              background: '#ECFDF5',
              color: GREEN,
              fontSize: '26px',
              fontWeight: 600,
            }}
          >
            Verified Seller
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: '36px',
              fontSize: '72px',
              fontWeight: 700,
              color: NAVY,
              textAlign: 'center',
            }}
          >
            {name}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '28px',
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  fontSize: '56px',
                  marginRight: i < 4 ? '8px' : '0px',
                  color: i < filledStars ? AMBER : '#E2E8F0',
                }}
              >
                ★
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                marginLeft: '20px',
                fontSize: '44px',
                fontWeight: 700,
                color: NAVY,
              }}
            >
              {rating.toFixed(1)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: '24px',
              fontSize: '32px',
              color: GRAY,
            }}
          >
            {sales} sales on myaircraft
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
