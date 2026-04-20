/**
 * Cloudflare native sitemap endpoint.
 * Avoids proxy loops and keeps crawlers stable even when upstream API is unavailable.
 */
import { buildSitemapResponse } from './_lib/sitemap-native.js';

export async function onRequest(context) {
  const { env } = context;
  return buildSitemapResponse(env);
}
