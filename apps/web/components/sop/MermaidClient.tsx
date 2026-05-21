'use client'

/**
 * MermaidClient — walks the SOP article after mount, finds
 * `<div class="sop-mermaid"><pre class="sop-mermaid-source">…</pre></div>`
 * blocks emitted by `lib/sop/parser.ts`, and replaces each one's contents
 * with a rendered SVG via the `mermaid` library.
 *
 * Mermaid is loaded on demand (only on pages that have at least one
 * diagram) so the SOP library home stays fast.
 *
 * Why a client walker instead of server-side render: mermaid renders via
 * a DOM API. We could pre-render to SVG strings server-side with jsdom,
 * but the diff in bundle size + edge-runtime compatibility isn't worth
 * it for an internal docs surface. Client-side mount is fine here.
 */
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    __sopMermaid?: {
      initialized?: boolean
      render?: (id: string, src: string) => Promise<{ svg: string }>
    }
  }
}

interface Props {
  /** The root id of the article HTML. Must be unique per page. */
  articleId: string
}

export function MermaidClient({ articleId }: Props) {
  const renderedRef = useRef(false)

  useEffect(() => {
    if (renderedRef.current) return
    const article = document.getElementById(articleId)
    if (!article) return
    const blocks = Array.from(
      article.querySelectorAll<HTMLDivElement>('div.sop-mermaid'),
    )
    if (blocks.length === 0) return
    renderedRef.current = true

    let cancelled = false
    ;(async () => {
      // Dynamic import — only loads on pages with at least one diagram.
      // mermaid is ~700KB unminified; deferring it keeps the library
      // home page light.
      let mermaid: typeof import('mermaid').default
      try {
        const mod = await import('mermaid')
        mermaid = mod.default
      } catch (err) {
        console.warn('[sop] mermaid failed to load:', err)
        return
      }
      if (cancelled) return

      if (!window.__sopMermaid?.initialized) {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            background: '#0a1020',
            primaryColor: '#1e293b',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#475569',
            lineColor: '#94a3b8',
            secondaryColor: '#312e81',
            tertiaryColor: '#0f172a',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system',
            fontSize: '13px',
          },
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
          sequence: { useMaxWidth: true },
        })
        window.__sopMermaid = { initialized: true }
      }

      // Render each block. Each gets a unique id so mermaid's internal
      // svg keying doesn't collide on multiple diagrams per page.
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]
        if (block.dataset.rendered === '1') continue
        const src = (block.querySelector('pre.sop-mermaid-source')?.textContent ?? '').trim()
        if (!src) continue
        try {
          const id = `sop-mermaid-${articleId}-${i}-${Date.now().toString(36)}`
          const { svg } = await mermaid.render(id, src)
          block.innerHTML = `<div class="sop-mermaid-rendered">${svg}</div>`
          block.dataset.rendered = '1'
        } catch (err) {
          // Surface the parse error inline so SOP authors can see what's
          // wrong with their diagram syntax.
          const msg = err instanceof Error ? err.message : String(err)
          block.innerHTML = `<div class="sop-mermaid-error" role="alert"><strong>Mermaid diagram failed to render:</strong><br/><code>${escapeHtml(msg)}</code></div>`
          console.warn('[sop] mermaid render failed:', err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [articleId])

  return null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
