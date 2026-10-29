import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdminPage } from '@/lib/admin-auth';
import { requirePrint } from '@/lib/print-auth';

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/print' || req.nextUrl.pathname.startsWith('/print/')) {
    const denied = requirePrint(req.headers.get('authorization'));
    return denied ?? NextResponse.next();
  }
  // 管理画面とモニターは同じBasic認証で保護する（APIは各Route Handler側でも認証する）
  const denied = requireAdminPage(req.headers.get('authorization'));
  if (denied) return denied;
  return NextResponse.next();
}

// 参加者画面と投稿APIには画面用のBasic認証をかけない
export const config = {
  matcher: ['/admin', '/admin/:path*', '/monitor', '/monitor/:path*', '/print', '/print/:path*'],
};
