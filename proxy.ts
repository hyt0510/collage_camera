import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;

  console.log(`[Proxy] Accessing path: ${url.pathname}`);

  // 保護したいパスのリスト（/monitor は除外）
  const protectedPaths = ['/admin'];

  // 現在のパスが保護対象かチェック
  const isProtected = protectedPaths.some(path => url.pathname.startsWith(path));

  if (isProtected) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;

    console.log(`[Proxy] Target path matches /admin. Env check - ADMIN_USER: ${user ? 'Loaded' : 'Not Loaded'}, ADMIN_PASSWORD: ${pass ? 'Loaded' : 'Not Loaded'}`);
    console.log(`[Proxy] Incoming Authorization header present: ${!!basicAuth}`);

    if (user && pass) {
      if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        if (authValue) {
          try {
            const [u, p] = atob(authValue).split(':');
            console.log(`[Proxy] Attempting auth - Input User: "${u}", Input Pass: "${p}". Expected User: "${user}", Expected Pass: "${pass}"`);
            if (u === user && p === pass) {
              console.log(`[Proxy] Auth SUCCESS. Proceeding.`);
              return NextResponse.next();
            } else {
              console.log(`[Proxy] Auth FAILED (Mismatch).`);
            }
          } catch (e) {
            console.error('[Proxy] Auth header decode error', e);
          }
        }
      }

      console.log(`[Proxy] Requiring Auth. Sending 401 Response.`);
      return new NextResponse('Auth Required.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Secure Area"',
        },
      });
    } else {
      console.warn('[Proxy] WARNING: ADMIN_USER or ADMIN_PASSWORD is not defined in env. Skipping auth.');
    }
  }

  return NextResponse.next();
}

// 実行対象のパスを指定（/monitorを除外し、/admin単体も明示的に含める）
export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
