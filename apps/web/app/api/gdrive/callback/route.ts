import { NextRequest, NextResponse } from 'next/server'
import CryptoJS from 'crypto-js'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TEN_MINUTES_MS = 10 * 60 * 1000

interface StatePayload {
  userId: string
  orgId: string
  timestamp: number
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface GoogleUserInfo {
  id: string
  email: string
  name?: string
  picture?: string
}

function encryptTokens(tokens: { access_token: string; refresh_token?: string }): string {
  const secret = process.env.ENCRYPTION_SECRET!
  return CryptoJS.AES.encrypt(JSON.stringify(tokens), secret).toString()
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle user-denied consent
    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=denied`
      )
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=missing_params`
      )
    }

    // 2. Decode state and verify timestamp < 10 minutes old
    let statePayload: StatePayload
    try {
      statePayload = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=invalid_state`
      )
    }

    const { userId, orgId, timestamp } = statePayload
    if (!userId || !orgId || !timestamp) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=invalid_state`
      )
    }

    if (Date.now() - timestamp > TEN_MINUTES_MS) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=state_expired`
      )
    }

    // Verify auth matches state userId
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || user.id !== userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=auth_mismatch`
      )
    }

    // 3. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.text()
      console.error('[gdrive/callback] token exchange failed', tokenErr)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=token_exchange`
      )
    }

    const tokenData: GoogleTokenResponse = await tokenRes.json()

    // 4. Get user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    let googleEmail: string | undefined
    if (userInfoRes.ok) {
      const userInfo: GoogleUserInfo = await userInfoRes.json()
      googleEmail = userInfo.email
    }

    // 5. Encrypt tokens using AES-256 via crypto-js
    const encryptedTokens = encryptTokens({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    })

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // 6. Upsert gdrive_connections record
    const { error: upsertError } = await supabase
      .from('gdrive_connections')
      .upsert(
        {
          organization_id: orgId,
          user_id: userId,
          google_email: googleEmail,
          encrypted_tokens: encryptedTokens,
          token_expires_at: expiresAt,
          scopes: tokenData.scope.split(' '),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,user_id' }
      )

    if (upsertError) {
      console.error('[gdrive/callback] upsert error', upsertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=db_error`
      )
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      user_id: userId,
      action: 'gdrive.connected',
      entity_type: 'gdrive_connection',
      entity_id: orgId,
      metadata_json: { google_email: googleEmail },
    })

    // 7. Redirect to /documents/upload?gdrive=connected
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/documents/upload?gdrive=connected`
    )
  } catch (err) {
    console.error('[gdrive/callback GET] unexpected error', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?gdrive=error&reason=unknown`
    )
  }
}
