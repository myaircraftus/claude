import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { getPostBySlug, getAllPosts, getAllAuthors } from '@/lib/blog'

// Generate static paths for all MDX posts at build time
export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPostBySlug(params.slug)
  if (!post) return { title: 'Post Not Found' }

  const url = `https://www.myaircraft.us/blog/${post.slug}`
  return {
    title: `${post.title} · myaircraft.us`,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: post.authorName ? [post.authorName] : undefined,
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  }
}

function renderMarkdown(content: string): string {
  // Ultra-lightweight MD→HTML (enough for first pass; later replace with MDX/remark)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = content.split(/\r?\n/)
  const html: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#\s/.test(line)) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h1 class="text-4xl font-bold mt-10 mb-4 text-[#0A1628]">${esc(line.replace(/^#\s/, ''))}</h1>`); continue }
    if (/^##\s/.test(line)) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h2 class="text-2xl font-bold mt-8 mb-3 text-[#0A1628]">${esc(line.replace(/^##\s/, ''))}</h2>`); continue }
    if (/^###\s/.test(line)) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h3 class="text-xl font-semibold mt-6 mb-2 text-[#0A1628]">${esc(line.replace(/^###\s/, ''))}</h3>`); continue }
    if (/^[-*]\s/.test(line)) {
      if (!inList) { html.push('<ul class="list-disc pl-6 my-4 space-y-1 text-gray-700">'); inList = true }
      html.push(`<li>${esc(line.replace(/^[-*]\s/, ''))}</li>`); continue
    }
    if (inList) { html.push('</ul>'); inList = false }
    if (!line.trim()) { html.push('<div class="h-4"></div>'); continue }
    // Inline bold/italic
    let l = esc(line)
    l = l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    l = l.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    l = l.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">$1</code>')
    html.push(`<p class="my-4 leading-relaxed text-gray-700">${l}</p>`)
  }
  if (inList) html.push('</ul>')
  return html.join('\n')
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug)
  if (!post) notFound()

  const authors = await getAllAuthors()
  const author = authors.find((a) => a.slug === post.author)

  // Article JSON-LD for rich results
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage || 'https://www.myaircraft.us/opengraph-image',
    datePublished: post.publishedAt,
    author: {
      '@type': 'Person',
      name: author?.name || post.authorName || 'myaircraft.us',
    },
    publisher: {
      '@type': 'Organization',
      name: 'myaircraft.us',
      logo: { '@type': 'ImageObject', url: 'https://www.myaircraft.us/logo.png' },
    },
  }

  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <article className="max-w-3xl mx-auto px-6 py-16">
        <Link
          href="/blog"
          className="text-sm text-[#2563EB] hover:underline mb-6 inline-flex items-center gap-1"
        >
          ← Back to blog
        </Link>

        <div className="mb-6 flex items-center gap-3 text-sm">
          <span className="px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] font-semibold text-xs uppercase tracking-wide">
            {post.category}
          </span>
          <span className="text-gray-500">{post.readTime}</span>
          <span className="text-gray-400">•</span>
          <time className="text-gray-500" dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-[#0A1628] mb-4 leading-tight">
          {post.title}
        </h1>
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">{post.excerpt}</p>

        {author && (
          <div className="flex items-center gap-3 pb-6 mb-8 border-b border-gray-200">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center text-white font-semibold text-sm">
              {author.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0A1628]">{author.name}</div>
              <div className="text-xs text-gray-500">{author.role}</div>
            </div>
          </div>
        )}

        {post.coverImage && (
          <div className="mb-10 rounded-2xl overflow-hidden bg-gray-100 aspect-[16/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
        />

        <div className="mt-16 pt-8 border-t border-gray-200 flex items-center justify-between">
          <Link
            href="/blog"
            className="text-sm text-[#2563EB] hover:underline inline-flex items-center gap-1"
          >
            ← More posts
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-lg bg-[#2563EB] text-white text-sm font-semibold hover:bg-[#1d4ed8]"
          >
            Start free trial
          </Link>
        </div>
      </article>
    </PublicLayout>
  )
}
