export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  return new Response(
    JSON.stringify({
      error: `Unknown API route: ${url.pathname}. This deployment runs Cloudflare-native APIs; no Vercel catch-all proxy is enabled.`,
    }),
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
