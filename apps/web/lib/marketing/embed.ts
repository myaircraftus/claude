/**
 * Detect a YouTube / Vimeo URL and return its canonical embed URL.
 * Returns null if the input isn't a recognized embeddable video URL.
 *
 * Lives in its own file (no server-only imports) so it can be used from
 * client components.
 */
export function toEmbedUrl(input: string): string | null {
  if (!input) return null
  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v')
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      if (url.pathname.startsWith('/embed/')) return url.toString()
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/')[2]
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).pop()
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }
  return null
}
