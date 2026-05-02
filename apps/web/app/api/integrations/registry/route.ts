import { NextResponse } from 'next/server'

/**
 * Reports which OAuth-backed integrations have provider credentials configured
 * in the current environment. The Settings → Integrations UI uses this to
 * decide whether the "Connect" button should kick off the real OAuth flow or
 * sit in a polished "Coming soon" state with a tooltip.
 *
 * No secrets are returned — only booleans.
 */
export async function GET() {
  const has = (...vars: string[]) =>
    vars.every((name) => Boolean(process.env[name] && process.env[name]?.trim()))

  const providers = {
    quickbooks: has('QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET', 'QUICKBOOKS_REDIRECT_URI'),
    freshbooks: has('FRESHBOOKS_CLIENT_ID', 'FRESHBOOKS_CLIENT_SECRET', 'FRESHBOOKS_REDIRECT_URI'),
    googledrive: has('GOOGLE_CLIENT_ID', 'GOOGLE_REDIRECT_URI'),
  }

  return NextResponse.json({ providers })
}
