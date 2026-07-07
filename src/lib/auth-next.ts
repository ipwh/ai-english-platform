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
    async signIn() {
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        // Guard against unexpected null user to avoid AuthError on /api/auth/session.
        if (user?.id) {
          session.user.id = user.id;
          session.user.role = user.role || 'student';
        }
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
  trustHost: true,
});
