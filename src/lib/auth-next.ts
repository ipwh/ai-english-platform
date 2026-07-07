// ============================================
// NextAuth.js v5 配置 — Google OAuth + Prisma
// ============================================

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import db from './db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      // 限制只允許學校網域登入（可選）
      // profile(profile) {
      //   return { ...profile, role: 'student' };
      // },
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn(params: any) {
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session(params: any) {
      const { session, user } = params;
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: string }).role || 'student';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'database',
  },
});
