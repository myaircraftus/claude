import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, phone, tail_numbers, record_volume, message } = body

  // In production: send email notification, save to CRM, etc.
  // For now: log and return success
  console.log('Scan quote request:', { name, email, tail_numbers, record_volume })

  // Could integrate with Resend/SendGrid to notify info@myaircraft.us
  return NextResponse.json({
    success: true,
    message: 'Quote request received. We will contact you within 1 business day.',
  })
}
