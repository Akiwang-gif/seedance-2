import { NextResponse } from 'next/server';

export function middleware(request) {
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'index, follow');
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image).*)'],
};
