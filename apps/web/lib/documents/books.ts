import type { SupabaseClient } from '@supabase/supabase-js'

type EnsureBookInput = {
  organizationId: string
  aircraftId?: string | null
  bookType?: string | null
  bookNumber?: string | null
  bookAssignment?: string | null
  title?: string | null
  createdBy?: string | null
}

function isMeaningful(value?: string | null) {
  return Boolean(value && value.trim().length > 0)
}

export async function ensureBookRecord(
  supabase: SupabaseClient,
  input: EnsureBookInput
): Promise<string | null> {
  const hasBookInfo =
    isMeaningful(input.bookType) || isMeaningful(input.bookNumber) || isMeaningful(input.bookAssignment)
  if (!hasBookInfo) return null

  let query = supabase
    .from('books')
    .select('id')
    .eq('organization_id', input.organizationId)

  if (isMeaningful(input.aircraftId)) {
    query = query.eq('aircraft_id', input.aircraftId as string)
  } else {
    query = query.is('aircraft_id', null)
  }

  if (isMeaningful(input.bookType)) {
    query = query.eq('book_type', input.bookType as string)
  } else {
    query = query.is('book_type', null)
  }

  if (isMeaningful(input.bookNumber)) {
    query = query.eq('book_number', input.bookNumber as string)
  } else {
    query = query.is('book_number', null)
  }

  if (isMeaningful(input.bookAssignment)) {
    query = query.eq('book_assignment', input.bookAssignment as string)
  } else {
    query = query.is('book_assignment', null)
  }

  const { data: existing } = await query.maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: inserted, error } = await supabase
    .from('books')
    .insert({
      organization_id: input.organizationId,
      aircraft_id: input.aircraftId ?? null,
      book_type: input.bookType ?? null,
      book_number: input.bookNumber ?? null,
      book_assignment: input.bookAssignment ?? null,
      title: input.title ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create book record: ${error.message}`)
  }

  return (inserted?.id as string | undefined) ?? null
}
