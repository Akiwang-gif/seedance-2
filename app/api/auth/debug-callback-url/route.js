// 临时调试：查看 NextAuth 实际使用的 Google 回调地址（排查 400 redirect_uri_mismatch 后可删除）
import { NextResponse } from 'next/server';

export function GET() {
  const base = process.env.NEXTAUTH_URL || '';
  const callback = base ? `${base.replace(/\/$/, '')}/api/auth/callback/google` : '(NEXTAUTH_URL 未设置)';
  return NextResponse.json({
    NEXTAUTH_URL: base,
    googleCallbackUrl: callback,
    hint: '在 Google 控制台「已授权的重定向 URI」中必须包含上面 googleCallbackUrl 的完整字符串',
  });
}
