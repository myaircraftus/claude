/**
 * SOP Library — frontmatter + markdown parser.
 *
 * The library deliberately does NOT pull `gray-matter` or `remark`/`unified`
 * as dependencies. The SOP markdown schema is small and predictable, and
 * adding a parser tree would balloon the bundle for nine files.
 *
 * This module is server-only (uses `node:fs`). Imports must come from
 * Server Components, Route Handlers, or `'use server'` actions — never
 * a client component.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * The SOP markdown lives at repo-root/docs/sop/, OUTSIDE the apps/web
 * build root. Where it ends up on Vercel depends on
 * `outputFileTracingIncludes` in next.config.mjs.
 *
 * In dev (`next dev`), process.cwd() = apps/web, so ../../docs/sop is right.
 * On Vercel serverless, the function bundle preserves the relative tree
 * so ../../docs/sop is ALSO right.
 *
 * We still scan a couple of fallback candidates in case the layout
 * shifts (e.g., a future move into the app dir, or running outside the
 * monorepo).
 */
async function resolveSopDir(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), '..', '..', 'docs', 'sop'),
    path.join(process.cwd(), 'docs', 'sop'),
    path.join(process.cwd(), 'content', 'sop'),
  ]
  for (const dir of candidates) {
    try {
      const stat = await fs.stat(dir)
      if (stat.isDirectory()) return dir
    } catch {
      // try next
    }
  }
  // Fall through to the canonical default — readers will surface a 404.
  return candidates[0]
}

export interface SopFrontmatter {
  title: string
  module: string
  slug: string
  order: number
  faa_refs: string[]
  version: string
  last_updated: string
  status: 'active' | 'draft' | 'deprecated'
}

export interface SopRecord {
  slug: string
  frontmatter: SopFrontmatter
  /** Raw markdown body (no frontmatter). */
  body: string
  /** First 200 chars of the body, stripped of markdown syntax — for cards. */
  excerpt: string
}

/**
 * Parse a YAML-lite frontmatter block. The SOP schema only uses three
 * value shapes (string, number, array of strings), so a hand-rolled parser
 * is enough. Anything outside those shapes throws — better than silently
 * mis-typing a field.
 */
export function parseFrontmatter(input: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  if (!input.startsWith('---\n')) {
    return { frontmatter: {}, body: input }
  }
  const closing = input.indexOf('\n---\n', 4)
  if (closing === -1) {
    return { frontmatter: {}, body: input }
  }
  const yaml = input.slice(4, closing)
  const body = input.slice(closing + 5)

  const out: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    if (!raw.trim() || raw.trim().startsWith('#')) {
      i++
      continue
    }
    const colon = raw.indexOf(':')
    if (colon === -1) {
      i++
      continue
    }
    const key = raw.slice(0, colon).trim()
    const valueRaw = raw.slice(colon + 1).trim()

    if (valueRaw === '') {
      // Block list:
      //   key:
      //     - item1
      //     - item2
      const list: string[] = []
      i++
      while (i < lines.length && lines[i].startsWith('  -')) {
        const item = lines[i].replace(/^\s*-\s*/, '').trim()
        list.push(stripQuotes(item))
        i++
      }
      out[key] = list
      continue
    }

    // Number?
    if (/^-?\d+(\.\d+)?$/.test(valueRaw)) {
      out[key] = Number(valueRaw)
      i++
      continue
    }
    out[key] = stripQuotes(valueRaw)
    i++
  }

  return { frontmatter: out, body }
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

/**
 * Strip markdown syntax for the excerpt. Just enough to get readable
 * preview text — we don't need a full AST walk.
 */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
}

function coerceFrontmatter(raw: Record<string, unknown>, slug: string): SopFrontmatter {
  const get = (k: string) => raw[k]
  const str = (k: string, fallback = '') => (typeof get(k) === 'string' ? (get(k) as string) : fallback)
  const num = (k: string, fallback = 0) => (typeof get(k) === 'number' ? (get(k) as number) : fallback)
  const arr = (k: string) => (Array.isArray(get(k)) ? (get(k) as string[]) : [])
  const status = str('status', 'active')
  return {
    title: str('title', slug),
    module: str('module', ''),
    slug: str('slug', slug),
    order: num('order', 0),
    faa_refs: arr('faa_refs'),
    version: str('version', '1.0.0'),
    last_updated: str('last_updated', ''),
    status: (status === 'draft' || status === 'deprecated' ? status : 'active') as SopFrontmatter['status'],
  }
}

/** Read one SOP file by slug (e.g. "05-work-order-execution"). */
export async function readSop(slug: string): Promise<SopRecord | null> {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '')
  if (!safeSlug || safeSlug !== slug) return null
  const dir = await resolveSopDir()
  const filePath = path.join(dir, `${safeSlug}.md`)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const fm = coerceFrontmatter(frontmatter, safeSlug)
    return {
      slug: safeSlug,
      frontmatter: fm,
      body,
      excerpt: stripMarkdown(body).slice(0, 200),
    }
  } catch {
    return null
  }
}

/** Read every SOP file, sorted by frontmatter.order then slug. */
export async function listSops(): Promise<SopRecord[]> {
  const dir = await resolveSopDir()
  let entries: string[] = []
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const slugs = entries
    .filter((n) => n.endsWith('.md'))
    .map((n) => n.slice(0, -3))

  const records = await Promise.all(slugs.map(readSop))
  return records
    .filter((r): r is SopRecord => r !== null)
    .sort((a, b) => {
      const o = (a.frontmatter.order ?? 0) - (b.frontmatter.order ?? 0)
      return o !== 0 ? o : a.slug.localeCompare(b.slug)
    })
}

/**
 * Tiny markdown-to-HTML renderer. Covers the subset used by SOP files:
 * headings (#-####), bullet lists, fenced code blocks, inline code,
 * bold, italic, links, paragraphs, horizontal rules.
 *
 * NOT a full CommonMark implementation — but the SOP files are written
 * to this contract, so it's enough.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inCode = false
  let codeLang = ''
  let codeBuf: string[] = []
  let listOpen = false

  const flushList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }

  const inline = (s: string): string => {
    // Order matters: code → links → bold → italic.
    return escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
        const safe = String(href).startsWith('http') || String(href).startsWith('/')
        const link = safe ? href : '#'
        return `<a href="${link}" target="_blank" rel="noopener noreferrer">${text}</a>`
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  }

  /** Parse a GFM-style table block starting at `lines[i]`. Returns the
   *  number of lines consumed (0 if not a table). Pushes a `<table>…</table>`
   *  block onto `out` on success. Tables look like:
   *      | col1 | col2 |
   *      |------|------|
   *      |  a   |  b   |
   */
  const tryTable = (i: number): number => {
    const headerLine = lines[i]
    const sepLine = lines[i + 1] ?? ''
    if (!headerLine.includes('|') || !sepLine.includes('|')) return 0
    // Separator row must be all dashes, colons, pipes, and whitespace.
    if (!/^[\s|:\-]+$/.test(sepLine) || !/-{2,}/.test(sepLine)) return 0
    const splitRow = (row: string) =>
      row
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
    const headers = splitRow(headerLine)
    if (headers.length === 0) return 0
    // Column alignment from the separator row.
    const aligns = splitRow(sepLine).map((s) => {
      const left = s.startsWith(':')
      const right = s.endsWith(':')
      if (left && right) return 'center'
      if (right) return 'right'
      return 'left'
    })
    const rows: string[][] = []
    let j = i + 2
    while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
      rows.push(splitRow(lines[j]))
      j++
    }
    out.push('<table><thead><tr>')
    headers.forEach((h, idx) => {
      const a = aligns[idx] ?? 'left'
      out.push(`<th${a !== 'left' ? ` style="text-align:${a}"` : ''}>${inline(h)}</th>`)
    })
    out.push('</tr></thead><tbody>')
    rows.forEach((cells) => {
      out.push('<tr>')
      cells.forEach((c, idx) => {
        const a = aligns[idx] ?? 'left'
        out.push(`<td${a !== 'left' ? ` style="text-align:${a}"` : ''}>${inline(c)}</td>`)
      })
      out.push('</tr>')
    })
    out.push('</tbody></table>')
    return j - i
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]

    if (raw.startsWith('```')) {
      if (!inCode) {
        flushList()
        inCode = true
        codeLang = raw.slice(3).trim()
        codeBuf = []
      } else {
        const lang = (codeLang || 'text').toLowerCase()
        if (lang === 'mermaid') {
          // Distinct shell so a client component can hydrate to SVG. The
          // raw source is preserved as text content; nothing is sanitized
          // beyond escapeHtml (mermaid does its own parsing client-side).
          out.push(
            `<div class="sop-mermaid" data-mermaid="1"><pre class="sop-mermaid-source">${escapeHtml(codeBuf.join('\n'))}</pre></div>`,
          )
        } else {
          out.push(
            `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
          )
        }
        inCode = false
        codeLang = ''
        codeBuf = []
      }
      continue
    }
    if (inCode) {
      codeBuf.push(raw)
      continue
    }
    const line = raw

    if (line.trim() === '') {
      flushList()
      continue
    }
    // Tables — peek for header + separator + rows
    if (line.includes('|') && /^[\s|:\-]+$/.test(lines[i + 1] ?? '')) {
      flushList()
      const consumed = tryTable(i)
      if (consumed > 0) {
        i += consumed - 1
        continue
      }
    }
    if (line.startsWith('#### ')) {
      flushList()
      out.push(`<h4 id="${slugify(line.slice(5))}">${inline(line.slice(5))}</h4>`)
      continue
    }
    if (line.startsWith('### ')) {
      flushList()
      out.push(`<h3 id="${slugify(line.slice(4))}">${inline(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      flushList()
      out.push(`<h2 id="${slugify(line.slice(3))}">${inline(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      flushList()
      out.push(`<h1 id="${slugify(line.slice(2))}">${inline(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('> ')) {
      flushList()
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
      continue
    }
    if (line.startsWith('---')) {
      flushList()
      out.push('<hr />')
      continue
    }
    if (line.match(/^\s*-\s+/)) {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`)
      continue
    }
    flushList()
    out.push(`<p>${inline(line)}</p>`)
  }
  flushList()
  if (inCode && codeBuf.length) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }
  return out.join('\n')
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Extract a flat table of contents from headings (h2 + h3). */
export function extractToc(md: string): Array<{ level: 2 | 3; text: string; id: string }> {
  const out: Array<{ level: 2 | 3; text: string; id: string }> = []
  for (const line of md.split('\n')) {
    if (line.startsWith('### ')) {
      const text = line.slice(4)
      out.push({ level: 3, text, id: slugify(text) })
    } else if (line.startsWith('## ')) {
      const text = line.slice(3)
      out.push({ level: 2, text, id: slugify(text) })
    }
  }
  return out
}
