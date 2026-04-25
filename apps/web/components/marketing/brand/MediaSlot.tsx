import { toEmbedUrl } from '@/lib/marketing/content'

type Props = {
  /** Direct URL (image, video file, or YouTube/Vimeo). */
  src: string | null | undefined
  /** Inferred kind. If 'auto', detect from URL — embed-y URLs render as iframe. */
  kind?: 'image' | 'video' | 'embed' | 'auto'
  alt?: string
  className?: string
  /** Rendered when src is empty. */
  fallback?: React.ReactNode
  /** Aspect ratio for embeds. Default 16:9. */
  ratio?: 'video' | 'square' | 'auto'
}

/**
 * Universal media slot. Renders a CMS-managed image, uploaded video file,
 * or YouTube/Vimeo embed depending on the URL pattern. Falls back to the
 * provided node when the slot is empty.
 */
export function MediaSlot({ src, kind = 'auto', alt = '', className = '', fallback = null, ratio = 'video' }: Props) {
  const value = (src ?? '').trim()
  if (!value) return <>{fallback}</>

  let resolved: 'image' | 'video' | 'embed' = 'image'
  if (kind === 'auto') {
    const embed = toEmbedUrl(value)
    if (embed) resolved = 'embed'
    else if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(value)) resolved = 'video'
    else resolved = 'image'
  } else {
    resolved = kind
  }

  if (resolved === 'embed') {
    const embedUrl = toEmbedUrl(value) ?? value
    const ratioClass = ratio === 'square' ? 'aspect-square' : ratio === 'auto' ? '' : 'aspect-video'
    return (
      <div className={`${ratioClass} w-full overflow-hidden ${className}`.trim()}>
        <iframe
          src={embedUrl}
          title={alt || 'Embedded video'}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    )
  }

  if (resolved === 'video') {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={value}
        className={className}
        controls
        playsInline
        preload="metadata"
      />
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={value} alt={alt} className={className} loading="lazy" />
}
