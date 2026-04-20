/**
 * Cloudflare Pages preview route:
 * /article/:id -> /article.html?id=:id
 * Keeps static article runtime behavior consistent on Pages preview.
 */
export async function onRequest(context) {
  const { request, params } = context;
  const articleId = String((params && params.id) || '').trim();
  if (!articleId) {
    return Response.redirect(new URL('/articles.html', request.url).toString(), 302);
  }

  const target = new URL('/article.html', request.url);
  target.searchParams.set('id', articleId);
  return Response.redirect(target.toString(), 302);
}
