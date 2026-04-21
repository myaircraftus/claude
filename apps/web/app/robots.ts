import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/api/', '/admin/', '/dashboard', '/settings'],
      },
    ],
    sitemap: 'https://www.myaircraft.us/sitemap.xml',
  }
}
