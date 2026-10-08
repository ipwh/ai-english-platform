// ============================================
// NextAuth.js v5 配置 — Google OAuth + Prisma
// ============================================

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { StudentRepo } from '@/modules/repositories';
import { logger } from '@/shared/logger/logger';
import { AUTHJS_SESSION_COOKIES } from '@/shared/auth/auth-cookies';
import { resolveSignInRole } from '@/shared/auth/sign-in-role';
import { config } from '@/shared/config/config';
import { recordLoginActivity } from '@/shared/auth/auth';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (config.isProduction) {
      throw new Error(`[auth-next] 缺少必要的環境變數: ${name}。請在 Cloud Run 服務的環境變數中設定。`);
    }
    logger.warn({ module: 'auth-next', envVar: name }, 'OAuth may not function — env var not set');
    return '';
  }
  return value;
}

const googleClientId = getRequiredEnv('AUTH_GOOGLE_ID');
const googleClientSecret = getRequiredEnv('AUTH_GOOGLE_SECRET');

/**
 * 新教師首次登入時連結所有現行班級（不含 Demo）。
 *
 * 2026-10-08 生產事故：教師帳號由此 callback 自動建立（只寫 `User`），令
 * `TeacherClass` 全空 ⇒ 教師端學生名單／班級清單／作答情況一律看不到。
 * 動態載入 admin 服務（避免把 Prisma 服務併入本模組的靜態圖）；失敗只記 log，
 * **永不**阻擋登入（教師仍可由管理員補連結，或跑
 * `npm run db:link:teacher-classes:apply`）。
 */
async function linkNewTeacherToAllClasses(teacherId: string): Promise<void> {
  try {
    const { adminLinkTeacherToAllClasses } = await import('@/modules/admin/services/admin-operations');
    const classCount = await adminLinkTeacherToAllClasses(teacherId);
    logger.info({ module: 'auth', userId: teacherId, classCount }, 'Linked new teacher to all classes');
  } catch (error) {
    logger.error({ module: 'auth', userId: teacherId, error: error instanceof Error ? error.message : String(error) }, 'Failed to link new teacher to classes');
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      logger.info({ module: 'auth', provider: account?.provider, email: user.email }, 'signIn callback entered');

      let userRole: string | null = null;

      if (account?.provider === 'google' && user.email) {
        try {
          // 角色一律由 email 政策判定（單一 owner：`shared/auth/sign-in-role.ts`）：
          // 校內網域且非學號形式 ⇒ 教師；非校內網域 ⇒ 學生（永不取得教師權限）。
          const correctRole = resolveSignInRole(user.email);
          const existing = await StudentRepo.findUserByEmailMinimal(user.email);

          if (!existing) {
            logger.info({ module: 'auth', email: user.email }, 'creating new user');
            const created = await StudentRepo.createUser({
              email: user.email,
              name: user.name || (profile as { name?: string } | null)?.name || null,
              nameEn: user.name || (profile as { name?: string } | null)?.name || null,
              image: user.image || (profile as { picture?: string } | null)?.picture || null,
              role: correctRole,
            });
            userRole = correctRole;
            if (correctRole === 'teacher') {
              // 只在此（帳號建立）時連結：管理員日後移除全部班級即可收回權限。
              await linkNewTeacherToAllClasses(created.id);
            }
            await recordLoginActivity(created.id).catch((error: unknown) => {
              logger.warn({ module: 'auth', userId: created.id, error: error instanceof Error ? error.message : String(error) }, 'Failed to record Google login activity');
            });
          } else {
            // Auto-correct DB role if it doesn't match email pattern
            if (existing.role !== correctRole) {
              logger.info({ module: 'auth', email: user.email, oldRole: existing.role, newRole: correctRole }, 'Auto-correcting DB role');
              await StudentRepo.updateUser(existing.id, { role: correctRole });
              userRole = correctRole;
            } else {
              userRole = existing.role;
            }

            logger.info({ module: 'auth', userId: existing.id, role: userRole }, 'existing user found');
            await recordLoginActivity(existing.id).catch((error: unknown) => {
              logger.warn({ module: 'auth', userId: existing.id, error: error instanceof Error ? error.message : String(error) }, 'Failed to record Google login activity');
            });
            // 每次 Google 登入時更新名稱和頭像
            const googleName = user.name || (profile as { name?: string } | null)?.name;
            const googlePic = user.image || (profile as { picture?: string } | null)?.picture;
            if (googleName && googleName !== existing.name) {
              await StudentRepo.updateUser(existing.id, {
                name: googleName,
                nameEn: existing.nameEn || googleName,
                image: googlePic || existing.image,
              });
              logger.info({ module: 'auth', googleName }, 'updated name from Google profile');
            }
          }
        } catch (error) {
          logger.error({ module: 'auth', error: (error as Error).message }, 'failed to ensure Google user exists');
        }
      }

      // 確保 role 正確寫入 user 物件（jwt callback 會讀取此值）
      (user as { role?: string }).role = userRole || 'student';

      logger.info({ module: 'auth', role: userRole }, 'signIn callback complete');
      return true;
    },
    async redirect({ url, baseUrl }) {
      // 允許相對 callback URLs
      if (url.startsWith('/')) {
        const resolved = `${baseUrl}${url}`;
        // 如果最終目標是 baseUrl 根路徑，交給 root page 判斷角色導向
        if (resolved === `${baseUrl}/` || resolved === baseUrl) {
          return `${baseUrl}/`;
        }
        return resolved;
      }
      try {
        if (new URL(url).origin === baseUrl) {
          if (url === baseUrl || url === `${baseUrl}/`) {
            return `${baseUrl}/`;
          }
          return url;
        }
      } catch { /* ignore invalid URLs */ }
      return `${baseUrl}/`;
    },
    async jwt({ token, user, account }) {
      // 首次登入時 user 與 account 都有值
      if (user) {
        token.id = user.id;
        token.email = user.email || '';
        token.role = (user as { role?: string }).role || 'student';
        token.provider = account?.provider;
      }

      // 從 DB 同步最新角色（確保 role 變更後即時生效）
      if (token.email) {
        try {
          const dbUser = await StudentRepo.findUserByEmailMinimal(token.email as string);

          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role || 'student';
          }
        } catch (err) {
          logger.error({ module: 'auth', error: (err as Error).message }, 'jwt callback: db lookup failed');
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) || session.user.email || '';
        const role = (token.role as string | undefined) || 'student';
        session.user.role = role === 'teacher' || role === 'student' || role === 'admin' ? role : 'student';
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      logger.info({ module: 'auth:event', email: message.user.email, provider: message.account?.provider, isNewUser: message.isNewUser }, 'signIn succeeded');
    },
    async createUser(message) {
      logger.info({ module: 'auth:event', userId: message.user.id }, 'user created');
    },
    async linkAccount(message) {
      logger.info({ module: 'auth:event', provider: message.account.provider, userId: message.user.id }, 'account linked');
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: config.isProduction
        ? AUTHJS_SESSION_COOKIES[0]
        : AUTHJS_SESSION_COOKIES[1],
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: config.isProduction,
      },
    },
  },
  trustHost: true,
});
