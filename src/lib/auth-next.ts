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
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && user.email) {
        try {
          const existing = await db.user.findUnique({
            where: { email: user.email },
            select: { id: true, role: true },
          });

          if (!existing) {
            await db.user.create({
              data: {
                email: user.email,
                name: user.name || profile?.name || null,
                image: user.image || (profile as { picture?: string } | null)?.picture || null,
                role: 'student',
              },
            });
          }
        } catch (error) {
          console.error('[auth] failed to ensure Google user exists', error);
        }
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs (e.g. /role-select from signIn options)
      if (url.startsWith('/')) {
        // If the resolved url is just baseUrl + '/', send to role-select
        const resolved = `${baseUrl}${url}`;
        if (resolved === `${baseUrl}/` || resolved === baseUrl) {
          return `${baseUrl}/role-select`;
        }
        return resolved;
      }
      // Allows callback URLs on the same origin
      try {
        if (new URL(url).origin === baseUrl) {
          if (url === baseUrl || url === `${baseUrl}/`) {
            return `${baseUrl}/role-select`;
          }
          return url;
        }
      } catch {
        // ignore invalid URLs
      }
      return `${baseUrl}/role-select`;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role || 'student';
      }

      if (token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email as string },
          select: { id: true, role: true },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role || 'student';
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) || session.user.email || '';
        const role = (token.role as string | undefined) || 'student';
        session.user.role = role === 'teacher' || role === 'student' ? role : 'student';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
});
