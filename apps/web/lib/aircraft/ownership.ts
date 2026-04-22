import { createServerSupabase } from '@/lib/supabase/server'

type ServerSupabase = ReturnType<typeof createServerSupabase>

interface SyncAircraftOwnerAssignmentParams {
  supabase: ServerSupabase
  organizationId: string
  aircraftId: string
  ownerCustomerId?: string | null
}

export interface SyncedOwnerCustomer {
  id: string
  name: string | null
  company: string | null
  email: string | null
}

export async function findOwnerCustomer(
  supabase: ServerSupabase,
  organizationId: string,
  ownerCustomerId?: string | null
) {
  if (!ownerCustomerId) return null

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, company, email')
    .eq('organization_id', organizationId)
    .eq('id', ownerCustomerId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data as SyncedOwnerCustomer
}

export async function syncAircraftOwnerAssignment({
  supabase,
  organizationId,
  aircraftId,
  ownerCustomerId,
}: SyncAircraftOwnerAssignmentParams) {
  if (!ownerCustomerId) {
    const { error } = await supabase
      .from('aircraft_customer_assignments')
      .delete()
      .eq('organization_id', organizationId)
      .eq('aircraft_id', aircraftId)
      .eq('relationship', 'owner')

    return { error, customer: null as SyncedOwnerCustomer | null }
  }

  const customer = await findOwnerCustomer(supabase, organizationId, ownerCustomerId)
  if (!customer) {
    return { error: new Error('Owner customer not found'), customer: null as SyncedOwnerCustomer | null }
  }

  const { error: deleteOthersError } = await supabase
    .from('aircraft_customer_assignments')
    .delete()
    .eq('organization_id', organizationId)
    .eq('aircraft_id', aircraftId)
    .eq('relationship', 'owner')
    .neq('customer_id', ownerCustomerId)

  if (deleteOthersError) {
    return { error: deleteOthersError, customer }
  }

  const { data: existingAssignment, error: existingAssignmentError } = await supabase
    .from('aircraft_customer_assignments')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('aircraft_id', aircraftId)
    .eq('customer_id', ownerCustomerId)
    .maybeSingle()

  if (existingAssignmentError) {
    return { error: existingAssignmentError, customer }
  }

  if (existingAssignment?.id) {
    const { error } = await supabase
      .from('aircraft_customer_assignments')
      .update({
        relationship: 'owner',
        is_primary: true,
      })
      .eq('id', existingAssignment.id)

    return { error, customer }
  }

  const { error } = await supabase
    .from('aircraft_customer_assignments')
    .insert({
      organization_id: organizationId,
      aircraft_id: aircraftId,
      customer_id: ownerCustomerId,
      relationship: 'owner',
      is_primary: true,
    })

  return { error, customer }
}
