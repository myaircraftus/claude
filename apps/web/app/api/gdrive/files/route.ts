import { NextRequest, NextResponse } from 'next/server'
import CryptoJS from 'crypto-js'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface StoredTokens {
  access_token: string
  refresh_token?: string
}

interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime?: string
  parents?: string[]
}

interface DriveFilesResponse {
  files: DriveFile[]
  nextPageToken?: string
}

interface GoogleTokenRefreshResponse {
  access_token: string
  expires_in: number
  token_type: string
}

function decryptTokens(encryptedTokens: string): StoredTokens {
  const secret = process.env.ENCRYPTION_SECRET!
  const bytes = CryptoJS.AES.decrypt(encryptedTokens, secret)
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`)
  }

  const data: GoogleTokenRefreshResponse = await res.json()
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}

export async function GET(_req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get membership
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    // Get gdrive connection
    const { data: connection, error: connError } = await supabase
      .from('gdrive_connections')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 404 })
    }

    // 2. Decrypt tokens
    let tokens: StoredTokens
    try {
      tokens = decryptTokens(connection.encrypted_tokens)
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt tokens' }, { status: 500 })
    }

    let accessToken = tokens.access_token

    // 3. Refresh access token if expired
    const tokenExpiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at).getTime()
      : 0

    // Refresh if within 5 minutes of expiry or already expired
    if (Date.now() >= tokenExpiresAt - 5 * 60 * 1000) {
      if (!tokens.refresh_token) {
        return NextResponse.json(
          { error: 'Access token expired and no refresh token available. Please reconnect Google Drive.' },
          { status: 401 }
        )
      }

      try {
        const refreshed = await refreshAccessToken(tokens.refresh_token)
        accessToken = refreshed.access_token

        // Update the stored tokens with the new access token + expiry
        const newEncrypted = CryptoJS.AES.encrypt(
          JSON.stringify({ ...tokens, access_token: refreshed.access_token }),
          process.env.ENCRYPTION_SECRET!
        ).toString()

        await supabase
          .from('gdrive_connections')
          .update({
            encrypted_tokens: newEncrypted,
            token_expires_at: refreshed.expires_at,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', membership.organization_id)
          .eq('user_id', user.id)
      } catch (refreshErr) {
        console.error('[gdrive/files] token refresh error', refreshErr)
        return NextResponse.json(
          { error: 'Failed to refresh access token. Please reconnect Google Drive.' },
          { status: 401 }
        )
      }
    }

    // 4. Call Google Drive API
    const driveParams = new URLSearchParams({
      q: "mimeType='application/pdf'",
      fields: 'files(id,name,size,modifiedTime,parents)',
      pageSize: '50',
      orderBy: 'modifiedTime desc',
    })

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${driveParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!driveRes.ok) {
      const driveErr = await driveRes.text()
      console.error('[gdrive/files] Drive API error', driveErr)

      if (driveRes.status === 401) {
        // Mark connection as inactive
        await supabase
          .from('gdrive_connections')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('organization_id', membership.organization_id)
          .eq('user_id', user.id)
        return NextResponse.json(
          { error: 'Google Drive authorization revoked. Please reconnect.' },
          { status: 401 }
        )
      }

      return NextResponse.json({ error: 'Failed to list Drive files' }, { status: 502 })
    }

    const driveData: DriveFilesResponse = await driveRes.json()

    // 5. Return normalized file list
    const files = (driveData.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? parseInt(f.size, 10) : undefined,
      modifiedTime: f.modifiedTime,
    }))

    return NextResponse.json({ files })
  } catch (err) {
    console.error('[gdrive/files GET] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
