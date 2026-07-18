// ============================================
// NextAuth.js v5 Type Augmentation
// 擴展預設 User/Session 型別，加入 role、id 等自訂欄位
// ============================================

import type { UserRole } from '@/shared/types/types';

declare module 'next-auth' {
  interface User {
    id: string;
    role?: UserRole;
  }

  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: UserRole;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role?: UserRole;
  }
}
