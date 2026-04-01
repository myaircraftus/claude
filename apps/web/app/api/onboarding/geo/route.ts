import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') ?? ''

    if (!ip || ip === '::1' || ip === '127.0.0.1') {
      return NextResponse.json({ city: null, country: null })
    }

    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'myaircraft.us/1.0' },
    })
    const data = await res.json()
    return NextResponse.json({ city: data.city ?? null, country: data.country_name ?? null, region: data.region ?? null })
  } catch {
    return NextResponse.json({ city: null, country: null })
  }
}
