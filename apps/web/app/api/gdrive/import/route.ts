import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import CryptoJS from 'crypto-js'
import { createServerSupabase } from '@/lib/supabase/server'
import { queueDocumentIngestion } from '@/lib/ingestion/server'
import type { DocType, OrgRole } from '@/types'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import {
  buildInitialDocumentProcessingState,
  markDocumentProcessingFailed,
} from '@/lib/documents/processing-state'
import {
  deriveDocTypeFromClassification,
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'

const MECHANIC_ROLES: OrgRole[] = ['owner', 'admin', 'mechanic']
const importSchema = z.object({
  file_ids: z.array(z.string()).min(1).max(20),
  aircraft_id: z.string().uuid().optional(),
  doc_type: z.string().optional(),
  document_group: z.string().optional(),
  document_detail: z.string().optional(),
  document_subtype: z.string().optional(),
})
const VALID_DOC_TYPES: DocType[] = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
]

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

    const { file_ids, aircraft_id, doc_type, document_group, document_detail, document_subtype } = parsed.data

    const documentGroupId = isDocumentGroupId(document_group) ? document_group : null
    const documentDetailId = isDocumentDetailId(document_detail) ? document_detail : null
    const documentSubtype =
      typeof document_subtype === 'string' && document_subtype.trim().length > 0
        ? document_subtype.trim()
        : null
    const resolvedDocType = deriveDocTypeFromClassification(
      documentDetailId,
      VALID_DOC_TYPES.includes(doc_type as DocType) ? (doc_type as DocType) : 'miscellaneous'
    )
    const classificationFields = buildClassificationStorageFieldsBySelection(
      documentGroupId,
      documentDetailId,
      resolvedDocType
    )

    if (!VALID_DOC_TYPES.includes(resolvedDocType)) {
      return NextResponse.json({ error: 'Invalid document category selected' }, { status: 400 })
    }

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
        const docId = crypto.randomUUID()

        // c. Upload to Supabase Storage
        const storagePath = `${orgId}/${aircraft_id ?? 'general'}/originals/${docId}/${fileName}`
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
            id: docId,
            organization_id: orgId,
            aircraft_id: aircraft_id ?? null,
            title: fileName.replace(/\.pdf$/i, ''),
            doc_type: resolvedDocType,
            document_group_id: documentGroupId,
            document_detail_id: documentDetailId,
            document_subtype: documentSubtype,
            ...(classificationFields ?? {}),
            file_path: storagePath,
            file_name: fileName,
            file_size_bytes: fileSizeBytes,
            mime_type: meta.mimeType ?? 'application/pdf',
            parsing_status: 'queued',
            processing_state: buildInitialDocumentProcessingState(),
            ocr_required: false,
            source_provider: 'google_drive',
            gdrive_file_id: meta.id,
            gdrive_file_url: meta.webViewLink,
            gdrive_parent_folder: meta.parents?.[0] ?? null,
            uploaded_by: user.id,
            version_number: 1,
            uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (docError || !doc) {
          throw new Error(`Failed to create document record: ${docError?.message}`)
        }

        // e. Trigger the same ingestion orchestration used by direct uploads
        const ingestionResult = await queueDocumentIngestion(doc.id, {
          // Drive imports are user-triggered and should remain inline-first for
          // predictable ingestion behavior.
          preferBackground: false,
          allowInlineFallback: true,
        })

        if (ingestionResult.status === 'failed') {
          await (supabase as any)
            .from('documents')
            .update({
              parsing_status: 'failed',
              processing_state: markDocumentProcessingFailed(
                buildInitialDocumentProcessingState(),
                ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.',
                'uploaded'
              ),
              parse_error:
                ingestionResult.warning ?? 'Failed to hand document off for OCR/indexing.',
              parse_completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', doc.id)
            .eq('organization_id', orgId)
        }

        results.push({
          file_id: fileId,
          name: fileName,
          document_id: doc.id,
          status: ingestionResult.status === 'failed' ? 'failed' : 'imported',
          error: ingestionResult.status === 'failed' ? ingestionResult.warning : undefined,
        })
        if (ingestionResult.status === 'failed') {
          failed++
        } else {
          imported++
        }
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
      user_id: user.id,
      action: 'gdrive.files_imported',
      entity_type: 'document',
      entity_id: orgId,
      metadata_json: { imported, failed, file_ids },
    })

    return NextResponse.json({ imported, failed, results }, { status: 200 })
  } catch (err) {
    console.error('[gdrive/import POST] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
