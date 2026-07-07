'use client';

// ============================================
// NextAuth SessionProvider 包裝器
// 必須為 client component 才能使用 next-auth/react
// ============================================

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
