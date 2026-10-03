import { type NextRequest, NextResponse } from 'next/server';

// First, cheap line of defence: a visitor with no session cookie at all is sent to sign in before any
// passenger or driver page renders. It only checks that the cookie exists. Pages still verify the
// session with the API (lib/session.ts), and the API enforces every rule on every request.
export function proxy(request: NextRequest) {
  if (!request.cookies.has('tp_session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/passenger/:path*', '/driver/:path*'],
};
