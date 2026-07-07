import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth-next';

export default async function Home() {
  const session = await auth();
  const cookieStore = await cookies();
  const selectedRole = cookieStore.get('selected_role')?.value;

  // 已登入（Google OAuth / NextAuth session）
  if (session?.user?.id) {
    const role = selectedRole || session.user.role;
    if (role === 'teacher') {
      redirect('/teacher/dashboard');
    }
    if (role === 'student') {
      redirect('/student/dashboard');
    }
    redirect('/role-select');
  }

  // 未登入 → 登入頁
  redirect('/login');
}
