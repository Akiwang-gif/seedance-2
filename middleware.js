import { NextResponse } from 'next/server';

export function middleware(request) {
const res = NextResponse.next();

const isProd = process.env.VERCEL_ENV === 'production';
const host = request.headers.get('host') || '';
const isPreviewDomain = host.endsWith('.vercel.app');

const robots = isProd && !isPreviewDomain ? 'index, follow' : 'noindex, nofollow';
res.headers.set('X-Robots-Tag', robots);

return res;
}

export const config = {
matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
