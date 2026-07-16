// ============================================
// NextAuth.js v5 配置 — Google OAuth + Prisma
// ============================================

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import db from './db';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error(`[auth-next] 缺少必要的環境變數: ${name}。請在 Vercel Dashboard 中設定。`);
    }
    console.warn(`[auth-next] ⚠️ ${name} 未設定，OAuth 將無法正常運作。`);
    return '';
  }
  return value;
}

const googleClientId = getRequiredEnv('AUTH_GOOGLE_ID');
const googleClientSecret = getRequiredEnv('AUTH_GOOGLE_SECRET');

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('[auth] signIn callback entered', {
        provider: account?.provider,
        email: user.email,
        timestamp: new Date().toISOString(),
      });

      let userRole: string | null = null;

      if (account?.provider === 'google' && user.email) {
        try {
          const existing = await db.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true, name: true, nameEn: true, image: true },
          });

          if (!existing) {
            console.log('[auth] creating new user for', user.email);
            // 自動判斷角色：學生 email = s + 數字；其餘為教師
            const emailPrefix = user.email.split('@')[0];
            const isStudent = /^s\d{7}$/i.test(emailPrefix);
            const isAdmin = user.email === 'ipwh@pochiu.edu.hk';
            const defaultRole = isAdmin ? 'admin' : (isStudent ? 'student' : 'teacher');

            await db.user.create({
              data: {
                email: user.email,
                name: user.name || (profile as { name?: string } | null)?.name || null,
                nameEn: user.name || (profile as { name?: string } | null)?.name || null,
                image: user.image || (profile as { picture?: string } | null)?.picture || null,
                role: defaultRole,
              },
            });
            userRole = defaultRole;
          } else {
            // Detect correct role based on email pattern
            const emailPrefix = user.email.split('@')[0];
            const isStudent = /^s\d{7}$/i.test(emailPrefix);
            const isAdmin = user.email === 'ipwh@pochiu.edu.hk';
            const correctRole = isAdmin ? 'admin' : (isStudent ? 'student' : 'teacher');

            // Auto-correct DB role if it doesn't match email pattern
            if (existing.role !== correctRole) {
              console.log(`[auth] Auto-correcting DB role for ${user.email}: ${existing.role} → ${correctRole}`);
              await db.user.update({
                where: { id: existing.id },
                data: { role: correctRole },
              });
              userRole = correctRole;
            } else {
              userRole = existing.role;
            }

            console.log('[auth] existing user found', existing.id, userRole);
            // 每次 Google 登入時更新名稱和頭像
            const googleName = user.name || (profile as { name?: string } | null)?.name;
            const googlePic = user.image || (profile as { picture?: string } | null)?.picture;
            if (googleName && googleName !== existing.name) {
              await db.user.update({
                where: { id: existing.id },
                data: {
                  name: googleName,
                  nameEn: existing.nameEn || googleName,
                  image: googlePic || existing.image,
                },
              });
              console.log('[auth] updated name from Google profile:', googleName);
            }
          }
        } catch (error) {
          console.error('[auth] failed to ensure Google user exists', error);
        }
      }

      // 確保 role 正確寫入 user 物件（jwt callback 會讀取此值）
      (user as { role?: string }).role = userRole || 'student';

      console.log('[auth] signIn callback complete, role:', userRole);
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
          const dbUser = await db.user.findUnique({
            where: { email: token.email as string },
            select: { id: true, role: true },
          });

          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role || 'student';
          }
        } catch (err) {
          console.error('[auth] jwt callback: db lookup failed', err);
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
      console.log('[auth:event] signIn succeeded', {
        email: message.user.email,
        provider: message.account?.provider,
        isNewUser: message.isNewUser,
      });
    },
    async createUser(message) {
      console.log('[auth:event] user created', { id: message.user.id });
    },
    async linkAccount(message) {
      console.log('[auth:event] account linked', {
        provider: message.account.provider,
        userId: message.user.id,
      });
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  trustHost: true,
});
