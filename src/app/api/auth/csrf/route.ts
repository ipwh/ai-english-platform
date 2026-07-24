// ============================================
// GET /api/auth/csrf — Get CSRF token for client-side use
// Client reads this token and sends it as X-CSRF-Token header
// on mutation requests (POST/PUT/PATCH/DELETE)
// ============================================

import { type NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken } from '@/shared/auth/csrf';
import { logger } from '@/shared/logger/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const existingToken = request.cookies.get('csrf-token')?.value;
    const token = existingToken || generateCsrfToken();

    const response = NextResponse.json({ csrfToken: token });

    // Set cookie if not already present (Double Submit Cookie pattern)
    if (!existingToken) {
      response.cookies.set('csrf-token', token, {
        httpOnly: false, // Client needs to read it
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }

    return response;
  } catch (err) {
    logger.error({ module: 'csrf-api', error: (err as Error)?.message }, 'CSRF token generation failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
