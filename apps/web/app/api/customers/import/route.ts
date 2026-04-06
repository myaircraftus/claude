import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const orgId = membership.organization_id

  // Parse multipart form data
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
  }

  // Parse header row
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
  const nameIdx = headers.indexOf('name')
  const companyIdx = headers.indexOf('company')
  const emailIdx = headers.indexOf('email')
  const phoneIdx = headers.indexOf('phone')
  const notesIdx = headers.indexOf('notes')
  const tagsIdx = headers.indexOf('tags')

  if (nameIdx === -1) {
    return NextResponse.json({ error: 'CSV must have a "name" column' }, { status: 400 })
  }

  // Get existing customer emails for dedup
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('email')
    .eq('organization_id', orgId)
    .not('email', 'is', null)

  const existingEmails = new Set(
    (existingCustomers ?? []).map(c => c.email?.toLowerCase())
  )

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Parse CSV field that may be quoted
  function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i])
    const name = fields[nameIdx]?.replace(/^"|"$/g, '').trim()

    if (!name) {
      errors.push(`Row ${i + 1}: missing name`)
      continue
    }

    const email = emailIdx >= 0 ? fields[emailIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const company = companyIdx >= 0 ? fields[companyIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const phone = phoneIdx >= 0 ? fields[phoneIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const notes = notesIdx >= 0 ? fields[notesIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const tagsRaw = tagsIdx >= 0 ? fields[tagsIdx]?.replace(/^"|"$/g, '').trim() || null : null
    const tags = tagsRaw ? tagsRaw.split(';').map(t => t.trim()).filter(Boolean) : null

    // Skip duplicates by email
    if (email && existingEmails.has(email.toLowerCase())) {
      skipped++
      continue
    }

    const { error: insertError } = await supabase
      .from('customers')
      .insert({
        organization_id: orgId,
        name,
        company,
        email,
        phone,
        notes,
        tags,
        imported_at: new Date().toISOString(),
        import_source: 'csv',
      })

    if (insertError) {
      errors.push(`Row ${i + 1}: ${insertError.message}`)
    } else {
      imported++
      // Track newly imported email for dedup within batch
      if (email) existingEmails.add(email.toLowerCase())
    }
  }

  return NextResponse.json({ imported, skipped, errors })
}
