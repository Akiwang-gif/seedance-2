/** 爬虫规则，供 GSC 等发现 sitemap。访问 /robots.txt */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://seedance-2.info';

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
