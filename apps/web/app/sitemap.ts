import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'

const baseUrl = 'https://www.myaircraft.us'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    '',
    '/about',
    '/features',
    '/pricing',
    '/scanning',
    '/blog',
    '/contact',
    '/privacy',
    '/terms',
  ]

  const staticEntries: MetadataRoute.Sitemap = staticPages.map((p) => ({
    url: `${baseUrl}${p}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1.0 : 0.7,
  }))

  // Include individual blog posts
  let blogEntries: MetadataRoute.Sitemap = []
  try {
    const posts = await getAllPosts()
    blogEntries = posts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))
  } catch {
    // Blog content directory may not be present in every environment — fail gracefully
  }

  return [...staticEntries, ...blogEntries]
}
