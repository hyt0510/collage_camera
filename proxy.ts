import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdminPage } from '@/lib/admin-auth';

export function proxy(req: NextRequest) {
  // 管理画面とモニターは同じBasic認証で保護する（APIは各Route Handler側でも認証する）
  const denied = requireAdminPage(req.headers.get('authorization'));
  if (denied) return denied;
  return NextResponse.next();
}

// 参加者画面と投稿APIには画面用のBasic認証をかけない
export const config = {
  matcher: ['/admin', '/admin/:path*', '/monitor', '/monitor/:path*'],
};
