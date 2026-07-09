import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth-next';
import db from '@/lib/db';

export default async function Home() {
  const session = await auth();
  const cookieStore = await cookies();
  const selectedRole = cookieStore.get('selected_role')?.value;

  // 已登入（Google OAuth / NextAuth session）
  if (session?.user?.id) {
    // 直接從 DB 查詢最新角色（避免 JWT 快取中的舊 role）
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

    console.log('[root:/] resolved role:', role);

    // Admin/教師 → 角色選擇頁面（可自由切換學生/教師/管理員）
    if (role === 'admin' || role === 'teacher') {
      redirect('/role-select');
    }
    if (role === 'student') {
      redirect('/student/dashboard');
    }
    // 未知角色 → 角色選擇
    redirect('/role-select');
  }

  // 未登入 → 登入頁
  redirect('/login');
}
