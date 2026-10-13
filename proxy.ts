import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireAdminPage } from '@/lib/admin-auth';

export function proxy(req: NextRequest) {
  // 管理画面はBasic認証で保護する（管理用APIは各Route Handler側で個別に認証する）
  const denied = requireAdminPage(req.headers.get('authorization'));
  if (denied) return denied;
  return NextResponse.next();
}

// 実行対象のパスを指定（/monitorを除外し、/admin単体も明示的に含める）
export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
