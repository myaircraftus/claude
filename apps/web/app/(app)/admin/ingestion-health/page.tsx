import { IngestionHealthClient } from './ingestion-health-client'

export const metadata = { title: 'Ingestion Health · Admin' }

export default function IngestionHealthPage() {
  // The /admin layout already gates is_platform_admin, so by the time we
  // get here we know the user is authorized.
  return <IngestionHealthClient />
}
