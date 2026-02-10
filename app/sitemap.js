/** 网站地图，供 Google Search Console 等抓取。访问 /sitemap.xml */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://seedance-2.info';

export default function sitemap() {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/generate`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
