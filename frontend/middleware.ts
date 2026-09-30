import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/forgot-password', '/reset-password', '/activate'];

/**
 * Coarse route guard: pages need a session cookie. The API still validates every request
 * (and refreshes expired access tokens), so this only avoids flashing protected pages.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has('refresh_token') || req.cookies.has('access_token');
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // `/home` was the old admin launcher page; keep old bookmarks working.
  if (pathname === '/' || pathname === '/home') {
    const url = req.nextUrl.clone();
    // Teachers are sent on to their classes by the app's role guard.
    url.pathname = hasSession ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API proxy, uploads, Next internals and static files (images, the sign-in page's video).
  matcher: ['/((?!api|uploads|_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|webm)$).*)'],
};
