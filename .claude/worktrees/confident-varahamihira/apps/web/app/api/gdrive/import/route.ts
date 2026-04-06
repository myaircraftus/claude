import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import CryptoJS from 'crypto-js'
import { createServerSupabase } from '@/lib/supabase/server'
import type { DocType, OrgRole } from '@/types'

const MECHANIC_ROLES: OrgRole[] = ['owner', 'admin', 'mechanic']

const importSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(20),
  aircraft_id: z.string().uuid().optional(),
  doc_type: z.string(),
})

interface StoredTokens {
  access_token: string
  refresh_token?: string
}

interface DriveFileMeta {
  id: string
  name: string
  size?: string
  mimeType?: string
  modifiedTime?: string
  webViewLink?: string
  parents?: string[]
}

interface ImportResult {
  file_id: string
  name?: string
  document_id?: string
  status: 'imported' | 'failed'
  error?: string
}

function decryptTokens(encryptedTokens: string): StoredTokens {
  const secret = process.env.ENCRYPTION_SECRET!
  const bytes = CryptoJS.AES.decrypt(encryptedTokens, secret)
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8))
}

async function refreshTokenIfNeeded(
  tokens: StoredTokens,
  tokenExpiresAt: string | null
): Promise<string> {
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() : 0

  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    if (!tokens.refresh_token) {
      throw new Error('Access token expired and no refresh token available')
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
    const data = await res.json()
    return data.access_token as string
  }

  return tokens.access_token
}

export async function POST(req: NextRequest) {
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

    // Role check: mechanic+
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }

    if (!MECHANIC_ROLES.includes(membership.role as OrgRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Mechanic role or higher required.' },
        { status: 403 }
      )
    }

    const orgId = membership.organization_id

    // Parse body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = importSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { file_ids, aircraft_id, doc_type } = parsed.data

    // 2. Get + decrypt gdrive connection
    const { data: connection } = await supabase
      .from('gdrive_connections')
      .select('*')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Google Drive not connected' }, { status: 404 })
    }

    let tokens: StoredTokens
    try {
      tokens = decryptTokens(connection.encrypted_tokens)
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt tokens' }, { status: 500 })
    }

    let accessToken: string
    try {
      accessToken = await refreshTokenIfNeeded(tokens, connection.token_expires_at)
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to get valid access token. Please reconnect Google Drive.' },
        { status: 401 }
      )
    }

    // 3. Process each file
    const results: ImportResult[] = []
    let imported = 0
    let failed = 0

    for (const fileId of file_ids) {
      try {
        // a. GET file metadata
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,modifiedTime,webViewLink,parents`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!metaRes.ok) {
          throw new Error(`Failed to fetch file metadata: ${metaRes.status}`)
        }

        const meta: DriveFileMeta = await metaRes.json()

        // b. Download file bytes
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!downloadRes.ok) {
          throw new Error(`Failed to download file: ${downloadRes.status}`)
        }

        const fileBytes = await downloadRes.arrayBuffer()
        const fileName = meta.name ?? `drive-${fileId}.pdf`
        const fileSizeBytes = fileBytes.byteLength

        // c. Upload to Supabase Storage
        const storagePath = `${orgId}/${aircraft_id ?? 'org'}/${Date.now()}-${fileName}`
        const { error: storageError } = await supabase.storage
          .from('documents')
          .upload(storagePath, fileBytes, {
            contentType: meta.mimeType ?? 'application/pdf',
            upsert: false,
          })

        if (storageError) {
          throw new Error(`Storage upload failed: ${storageError.message}`)
        }

        // d. Create document record with gdrive metadata
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .insert({
            organization_id: orgId,
            aircraft_id: aircraft_id ?? null,
            title: fileName.replace(/\.pdf$/i, ''),
            doc_type: doc_type as DocType,
            file_path: storagePath,
            file_name: fileName,
            file_size_bytes: fileSizeBytes,
            mime_type: meta.mimeType ?? 'application/pdf',
            parsing_status: 'queued',
            ocr_required: false,
            source_provider: 'google_drive',
            gdrive_file_id: meta.id,
            gdrive_file_url: meta.webViewLink,
            gdrive_parent_folder: meta.parents?.[0] ?? null,
            uploaded_by: user.id,
            uploaded_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (docError || !doc) {
          throw new Error(`Failed to create document record: ${docError?.message}`)
        }

        // e. Trigger ingestion job via Supabase edge function or job queue
        // Signal the worker by updating the status to 'queued' (already set above)
        // Optionally trigger a webhook/edge function
        try {
          await supabase.functions.invoke('process-document', {
            body: { document_id: doc.id, organization_id: orgId },
          })
        } catch (triggerErr) {
          // Non-fatal: document is queued and will be picked up by worker poll
          console.warn('[gdrive/import] trigger job warning', triggerErr)
        }

        results.push({ file_id: fileId, name: fileName, document_id: doc.id, status: 'imported' })
        imported++
      } catch (fileErr) {
        const errMsg = fileErr instanceof Error ? fileErr.message : 'Unknown error'
        console.error(`[gdrive/import] file ${fileId} failed:`, errMsg)
        results.push({ file_id: fileId, status: 'failed', error: errMsg })
        failed++
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: 'gdrive.files_imported',
      target_type: 'document',
      target_id: orgId,
      metadata: { imported, failed, file_ids },
    })

    return NextResponse.json({ imported, failed, results }, { status: 200 })
  } catch (err) {
    console.error('[gdrive/import POST] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
