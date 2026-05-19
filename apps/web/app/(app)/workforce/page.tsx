import { redirect } from 'next/navigation'

/**
 * `/workforce` has no index surface — the Work Force sidebar links point
 * straight at the sub-pages (dashboard, scheduler, timesheets, …). A bare
 * hit on `/workforce` lands on the dashboard rather than 404-ing.
 */
export default function WorkforceIndexPage() {
  redirect('/workforce/dashboard')
}
