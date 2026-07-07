// ============================================
// NextAuth session endpoint shim
// Keeps /api/auth/session available for Next.js route typing
// while delegating to the shared NextAuth handlers.
// ============================================

import { handlers } from '@/lib/auth-next';

export const { GET, POST } = handlers;
