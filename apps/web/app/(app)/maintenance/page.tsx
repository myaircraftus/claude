import { redirect } from 'next/navigation'

// The /maintenance hub was retired. Each tab moved to its own dedicated
// route so deep links + back-button behavior are no longer broken by
// the in-page tab switcher:
//   - work-orders → /work-orders (single source of truth, click goes
//                                  straight to /work-orders/[id])
//   - workflow    → /workflow    (Operations Dashboard surface)
//   - parts       → /parts       (was already a redirect target)
//   - entries     → /work-orders (entry generator lives inside each WO)
// Old links with ?tab=… are honored so any saved bookmarks still resolve
// to the new route layout.
export default function MaintenanceRedirect({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const requestedTab = Array.isArray(searchParams?.tab)
    ? searchParams?.tab[0]
    : searchParams?.tab

  switch (requestedTab) {
    case 'workflow':
      redirect('/workflow')
    case 'parts':
      redirect('/parts')
    case 'work-orders':
    case 'entries':
    default:
      redirect('/work-orders')
  }
}
