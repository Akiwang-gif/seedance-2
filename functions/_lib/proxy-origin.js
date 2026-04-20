export function getProxyOrigin(env) {
  const fallback = 'https://www.seedance-2.info';
  return String((env && env.API_PROXY_ORIGIN) || fallback).replace(/\/$/, '');
}

export async function proxyToOrigin(request, env, pathAndSearch) {
  const origin = getProxyOrigin(env);
  const url = new URL(request.url);
  const requestOrigin = String(url.origin || '').replace(/\/$/, '');
  if (origin === requestOrigin) {
    return new Response(
      JSON.stringify({
        error: 'Proxy loop blocked: API_PROXY_ORIGIN points to the current host. Set API_PROXY_ORIGIN to your upstream origin (e.g. Vercel).',
      }),
      {
        status: 508,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  const target = origin + (pathAndSearch || (url.pathname + url.search));
  return fetch(new Request(target, request));
}
