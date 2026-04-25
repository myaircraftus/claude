import { getBrandKit } from '@/lib/marketing/brand'
import { MyAircraftLogo } from '@/components/marketing/vite/MyAircraftLogo'

type Variant = 'primary' | 'mark' | 'dark'

/**
 * Renders the platform logo from the brand kit, falling back to the bundled
 * MyAircraftLogo SVG when the slot is empty.
 */
export async function BrandLogo({
  variant = 'primary',
  className = '',
  alt = 'myaircraft.us',
}: {
  variant?: Variant
  className?: string
  alt?: string
}) {
  const kit = await getBrandKit()
  const slot = variant === 'mark' ? 'logo_mark' : variant === 'dark' ? 'logo_dark' : 'logo_primary'
  const url = kit[slot]
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={className} />
  }
  return <MyAircraftLogo className={className} />
}

/**
 * Tech-partner logo. Looks up brand.partner_<name>; falls back to the bundled
 * /logos/<name>.svg if no admin override; finally a wordmark.
 */
export async function PartnerLogo({
  name,
  className = '',
  alt,
}: {
  name: string
  className?: string
  alt?: string
}) {
  const kit = await getBrandKit()
  const cmsUrl = kit[`partner_${name}`]
  const fallbackUrl = `/logos/${name}.svg`
  const src = cmsUrl || fallbackUrl
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? name} className={className} />
}

/**
 * OEM aircraft brand logo (Cessna, Piper, etc.).
 * Renders the admin-uploaded logo if present; otherwise the inline SVG fallback
 * passed via `fallback` (typically the existing AircraftBrandLogo SVG).
 */
export async function OemLogo({
  name,
  fallback,
  className = '',
  alt,
}: {
  name: string
  fallback: React.ReactNode
  className?: string
  alt?: string
}) {
  const kit = await getBrandKit()
  const url = kit[`oem_${name}`]
  if (!url) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? name} className={className} />
}

/**
 * Generic brand-icon slot. Lets any page swap a system icon (lucide, etc.) for
 * an admin-uploaded SVG. Pass the lucide icon as `fallback`.
 */
export async function BrandIcon({
  name,
  fallback,
  className = '',
  alt,
}: {
  name: string
  fallback: React.ReactNode
  className?: string
  alt?: string
}) {
  const kit = await getBrandKit()
  const url = kit[`icon_${name}`]
  if (!url) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? name} className={className} />
}
