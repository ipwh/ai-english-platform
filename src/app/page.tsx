import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth-next';

export default async function Home() {
  const session = await auth();
  const cookieStore = await cookies();
  const selectedRole = cookieStore.get('selected_role')?.value;

  console.log('[root:/]', {
    hasSession: !!session?.user?.id,
    sessionRole: session?.user?.role ?? null,
    selectedRole,
    resolvedRole: selectedRole || (session?.user?.role ?? null),
    timestamp: new Date().toISOString(),
  });

  // 已登入（Google OAuth / NextAuth session）
  if (session?.user?.id) {
    const role = selectedRole || session.user.role;
    if (role === 'teacher') {
      console.log('[root:/] redirect → /teacher/dashboard');
      redirect('/teacher/dashboard');
    }
    if (role === 'student') {
      console.log('[root:/] redirect → /student/dashboard');
      redirect('/student/dashboard');
    }
    console.log('[root:/] no recognized role → /role-select');
    redirect('/role-select');
  }

  // 未登入 → 登入頁
  console.log('[root:/] no session → /login');
  redirect('/login');
}
