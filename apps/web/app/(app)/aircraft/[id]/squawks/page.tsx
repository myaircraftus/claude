import { redirect } from 'next/navigation'

export const metadata = { title: 'Squawks' }

export default async function SquawksPage({ params }: { params: { id: string } }) {
  redirect(`/aircraft/${params.id}?tab=maintenance&sub=squawks`)
}
