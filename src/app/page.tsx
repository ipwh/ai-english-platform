import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth-next';
import { verifySessionToken } from '@/lib/jwt';
import db from '@/lib/db';

/** 根據 email 判斷用戶的「真實最高角色」（不可被角色切換降級） */
function getRealRoleByEmail(email: string): 'admin' | 'teacher' | 'student' {
  if (email === 'ipwh@pochiu.edu.hk') return 'admin';
  const prefix = email.split('@')[0];
  if (/^s\d{7}$/i.test(prefix)) return 'student';
  return 'teacher';
}

export default async function Home() {
  const cookieStore = await cookies();
  const selectedRole = cookieStore.get('selected_role')?.value;

  // === 優先檢查 JWT session_token cookie（密碼登入） ===
  const jwtToken = cookieStore.get('session_token')?.value;
  if (jwtToken) {
    const jwtPayload = await verifySessionToken(jwtToken);
    if (jwtPayload) {
      const email = jwtPayload.email;
      const realRole = getRealRoleByEmail(email);
      let role = selectedRole || jwtPayload.role;

      // 從 DB 查詢最新角色（以 DB 為準），並自動修復被角色切換污染的 DB role
      try {
        const dbUser = await db.user.findUnique({
          where: { email },
          select: { role: true },
        });
        if (dbUser) {
          // 若 DB role 與 email 模式不符（被舊版角色切換污染），自動修復
          if (dbUser.role !== realRole && realRole !== 'student') {
            console.log(`[root:/] Auto-fixing DB role for ${email}: ${dbUser.role} → ${realRole}`);
            await db.user.update({
              where: { email },
              data: { role: realRole },
            }).catch((e) => { console.error('Failed to auto-fix DB role:', e); });
          }
          if (!selectedRole) {
            role = dbUser.role;
          }
        }
      } catch (e) { console.error('Failed to resolve JWT session role:', e); }

      console.log('[root:/] JWT resolved role:', role, 'realRole:', realRole);

      if (role === 'admin' || role === 'teacher') {
        redirect('/role-select');
      }
      // 若 resolved role 是 student，但 realRole 不是 → 仍導向 role-select
      if (role === 'student' && realRole !== 'student') {
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
    const email = session.user.email || '';
    const realRole = getRealRoleByEmail(email);
    let role = selectedRole || (session.user as { role?: string }).role;
    try {
      const dbUser = await db.user.findUnique({
        where: { email },
        select: { role: true },
      });
      if (dbUser) {
        // 自動修復被污染的 DB role
        if (dbUser.role !== realRole && realRole !== 'student') {
          console.log(`[root:/] Auto-fixing DB role for ${email}: ${dbUser.role} → ${realRole}`);
          await db.user.update({
            where: { email },
            data: { role: realRole },
          }).catch(() => {});
        }
        if (!selectedRole) {
          role = dbUser.role;
        }
      }
    } catch { /* fallback to session role */ }

    console.log('[root:/] NextAuth resolved role:', role, 'realRole:', realRole);

    if (role === 'admin' || role === 'teacher') {
      redirect('/role-select');
    }
    if (role === 'student' && realRole !== 'student') {
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
