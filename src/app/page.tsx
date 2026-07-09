import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth-next';
import { verifySessionToken } from '@/lib/jwt';
import db from '@/lib/db';

export default async function Home() {
  const cookieStore = await cookies();
  const selectedRole = cookieStore.get('selected_role')?.value;

  // === 優先檢查 JWT session_token cookie（密碼登入） ===
  const jwtToken = cookieStore.get('session_token')?.value;
  if (jwtToken) {
    const jwtPayload = await verifySessionToken(jwtToken);
    if (jwtPayload) {
      // 從 DB 查詢最新角色（以 DB 為準）
      let role = selectedRole || jwtPayload.role;
      try {
        const dbUser = await db.user.findUnique({
          where: { email: jwtPayload.email },
          select: { role: true },
        });
        if (dbUser && !selectedRole) {
          role = dbUser.role;
        }
      } catch { /* fallback to JWT role */ }

      console.log('[root:/] JWT resolved role:', role);

      if (role === 'admin' || role === 'teacher') {
        redirect('/role-select');
      }
      if (role === 'student') {
        redirect('/student/dashboard');
      }
      redirect('/role-select');
    }
  }

  // === NextAuth session（Google OAuth 登入） ===
  const session = await auth();

  if (session?.user?.id) {
    let role = selectedRole || (session.user as { role?: string }).role;
    try {
      const dbUser = await db.user.findUnique({
        where: { email: session.user.email || '' },
        select: { role: true },
      });
      if (dbUser && !selectedRole) {
        role = dbUser.role;
      }
    } catch { /* fallback to session role */ }

    console.log('[root:/] NextAuth resolved role:', role);

    if (role === 'admin' || role === 'teacher') {
      redirect('/role-select');
    }
    if (role === 'student') {
      redirect('/student/dashboard');
    }
    redirect('/role-select');
  }

  // 未登入 → 登入頁
  redirect('/login');
}
