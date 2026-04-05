import { redirect } from 'next/navigation'

// The /library route has been consolidated into /marketplace.
// Permanently redirect visitors.
export default function LibraryRedirect() {
  redirect('/marketplace')
}
