import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-next';

export default async function Home() {
  const session = await auth();

  // 已登入（Google OAuth / NextAuth session）
  if (session?.user?.id) {
    const role = session.user.role;
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
