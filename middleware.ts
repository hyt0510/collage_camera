import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;

  // 保護したいパスのリスト
  const protectedPaths = ['/admin', '/monitor'];

  // 現在のパスが保護対象かチェック
  const isProtected = protectedPaths.some(path => url.pathname.startsWith(path));

  if (isProtected) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASSWORD;

    // 環境変数が設定されていない場合は、セキュリティリスクを避けるため
    // 開発時以外は警告を出すか、デフォルトで認証を求めるべきだが、
    // ここでは「設定されている場合のみ認証を行う」形にする
    if (user && pass) {
      if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        if (authValue) {
          const [u, p] = atob(authValue).split(':');
          if (u === user && p === pass) {
            return NextResponse.next();
          }
        }
      }

      return new NextResponse('Auth Required.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Secure Area"',
        },
      });
    }
  }

  return NextResponse.next();
}

// 実行対象のパスを指定
export const config = {
  matcher: ['/admin/:path*', '/monitor/:path*'],
};
