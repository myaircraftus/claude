import fs from 'node:fs'
import path from 'node:path'

/**
 * Lightweight MDX blog loader.
 *
 * Posts live in `content/blog/*.mdx` with YAML-style frontmatter delimited by
 * `---`. We keep the parser inline (no gray-matter dep) because our schema is
 * simple: flat key / string-value pairs, with quoted strings supported.
 *
 * Authors live in `content/blog/authors.json`, keyed by slug.
 */

export type BlogPost = {
  slug: string
  title: string
  excerpt: string
  author: string
  publishedAt: string
  category: string
  readTime: string
  coverImage?: string
  tag?: string
  tagColor?: string
  featured?: boolean
  authorName?: string
  authorRole?: string
  content: string
}

export type Author = {
  slug: string
  name: string
  role: string
  bio?: string
  avatar?: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog')

function stripQuotes(v: string): string {
  const trimmed = v.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(raw: string): { data: Record<string, string | boolean>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }

  const [, fmBlock, body] = match
  const data: Record<string, string | boolean> = {}

  for (const line of fmBlock.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const rawVal = stripQuotes(line.slice(idx + 1))
    if (rawVal === 'true') data[key] = true
    else if (rawVal === 'false') data[key] = false
    else data[key] = rawVal
  }

  return { data, content: body.trim() }
}

function contentDirExists(): boolean {
  try {
    return fs.statSync(CONTENT_DIR).isDirectory()
  } catch {
    return false
  }
}

export async function getAllPosts(): Promise<BlogPost[]> {
  if (!contentDirExists()) return []

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))

  const authors = await getAllAuthors()
  const authorsBySlug = new Map(authors.map((a) => [a.slug, a]))

  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8')
    const { data, content } = parseFrontmatter(raw)
    const slug = String(data.slug || file.replace(/\.(mdx|md)$/, ''))
    const authorSlug = String(data.author || '')
    const author = authorsBySlug.get(authorSlug)

    return {
      slug,
      title: String(data.title || ''),
      excerpt: String(data.excerpt || ''),
      author: authorSlug,
      authorName: author?.name ?? authorSlug,
      authorRole: author?.role ?? '',
      publishedAt: String(data.publishedAt || ''),
      category: String(data.category || ''),
      readTime: String(data.readTime || ''),
      coverImage: data.coverImage ? String(data.coverImage) : undefined,
      tag: data.tag ? String(data.tag) : undefined,
      tagColor: data.tagColor ? String(data.tagColor) : undefined,
      featured: data.featured === true || data.featured === 'true',
      content,
    } satisfies BlogPost
  })

  return posts.sort((a, b) => {
    if (!a.publishedAt || !b.publishedAt) return 0
    return b.publishedAt.localeCompare(a.publishedAt)
  })
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const posts = await getAllPosts()
  return posts.find((p) => p.slug === slug) ?? null
}

export async function getAllAuthors(): Promise<Author[]> {
  const authorsPath = path.join(CONTENT_DIR, 'authors.json')
  try {
    const raw = fs.readFileSync(authorsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, Omit<Author, 'slug'>>
    return Object.entries(parsed).map(([slug, value]) => ({ slug, ...value }))
  } catch {
    return []
  }
}
