import { AppLayout } from '@/components/redesign/AppLayout'
import { requireAppServerSession } from '@/lib/auth/server-app'
import type { ReactNode } from 'react'

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireAppServerSession()

  return (
    <AppLayout userName={profile.full_name ?? profile.email ?? 'Owner'}>
      {children}
    </AppLayout>
  )
}
