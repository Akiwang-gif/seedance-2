import { buildSitemapResponse } from '../_lib/sitemap-native.js';

export async function onRequest(context) {
  const { env } = context;
  return buildSitemapResponse(env);
}
