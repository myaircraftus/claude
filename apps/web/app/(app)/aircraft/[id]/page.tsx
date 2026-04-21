import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { AircraftDetail } from '@/components/redesign/AircraftDetail'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Aircraft' }

export default async function AircraftDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile | null
  if (!profile) redirect('/login')
  if (!membershipRes.data) redirect('/onboarding')

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select(`
      id,
      tail_number,
      serial_number,
      make,
      model,
      year,
      engine_make,
      engine_model,
      prop_make,
      prop_model,
      base_airport,
      operator_name,
      operation_types,
      total_time_hours,
      owner_customer_id
    `)
    .eq('organization_id', membershipRes.data.organization_id)
    .eq('id', params.id)
    .eq('is_archived', false)
    .maybeSingle()

  if (!aircraft) redirect('/aircraft')

  const [{ count: documentCount }, ownerCustomerRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', membershipRes.data.organization_id)
      .eq('aircraft_id', aircraft.id),
    aircraft.owner_customer_id
      ? supabase
          .from('customers')
          .select('name, company, email, phone')
          .eq('organization_id', membershipRes.data.organization_id)
          .eq('id', aircraft.owner_customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
      <AircraftDetail
        aircraftId={aircraft.id}
        aircraftTail={aircraft.tail_number}
        aircraft={{
          tail_number: aircraft.tail_number,
          serial_number: aircraft.serial_number,
          make: aircraft.make,
          model: aircraft.model,
          year: aircraft.year,
          engine_make: aircraft.engine_make,
          engine_model: aircraft.engine_model,
          prop_make: aircraft.prop_make,
          prop_model: aircraft.prop_model,
          base_airport: aircraft.base_airport,
          operator_name: aircraft.operator_name,
          operation_types: aircraft.operation_types,
          total_time_hours: aircraft.total_time_hours,
          document_count: documentCount ?? 0,
          owner_name: ownerCustomerRes.data?.name ?? null,
          owner_company: ownerCustomerRes.data?.company ?? null,
          owner_email: ownerCustomerRes.data?.email ?? null,
          owner_phone: ownerCustomerRes.data?.phone ?? null,
        }}
      />
    </Suspense>
  )
}
