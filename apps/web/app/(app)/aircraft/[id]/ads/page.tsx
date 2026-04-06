import { redirect } from 'next/navigation'

// Redirect to the main aircraft detail page which has the AD tab
export default function ADsPage({ params }: { params: { id: string } }) {
  redirect(`/aircraft/${params.id}`)
}
