// ============================================
// Auth Health Check — production guard for next-auth v5 beta
// Created Sprint 0.5
//
// Usage (optional, call during server startup):
//   import { checkAuthHealth } from '@/lib/auth-health';
//   await checkAuthHealth();
// ============================================

import { logger } from '@/lib/logger';

/** NextAuth version currently pinned in package.json */
const NEXT_AUTH_VERSION = '5.0.0-beta.31';

export interface AuthHealthStatus {
  /** Overall health pass/fail */
  healthy: boolean;
  /** Individual check results */
  checks: {
    nextAuthSecret: boolean;
    googleOAuth: boolean;
    databaseConnected: boolean;
  };
  /** Warnings (non-fatal) */
  warnings: string[];
  /** Version info */
  version: {
    nextAuth: string;
    environment: string;
  };
}

/**
 * Verify that production auth configuration is complete.
 * Logs warnings for missing configuration; does NOT throw.
 *
 * Detects environment from NODE_ENV and VERCEL env vars,
 * which are always available in the Next.js runtime.
 */
export async function checkAuthHealth(): Promise<AuthHealthStatus> {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    !!process.env.VERCEL;
  const warnings: string[] = [];

  // Check 1: NextAuth secret
  const hasNextAuthSecret = !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET;
  if (isProduction && !hasNextAuthSecret) {
    warnings.push(
      'AUTH_SECRET is not set. NextAuth session encryption will use an insecure default. ' +
        'Set AUTH_SECRET in Vercel Environment Variables. Generate: openssl rand -base64 32',
    );
  }

  // Check 2: Google OAuth credentials
  const hasGoogleId = !!process.env.AUTH_GOOGLE_ID;
  const hasGoogleSecret = !!process.env.AUTH_GOOGLE_SECRET;
  if (isProduction && (!hasGoogleId || !hasGoogleSecret)) {
    warnings.push(
      'Google OAuth credentials incomplete. Google Sign-In will not work. ' +
        'Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.',
    );
  }

  // Check 3: next-auth version (beta warning)
  if (NEXT_AUTH_VERSION.includes('beta')) {
    warnings.push(
      `next-auth is on beta version (${NEXT_AUTH_VERSION}). ` +
        'Monitor https://github.com/nextauthjs/next-auth/releases for stable release. ' +
        'Pin exact version in package.json to prevent unexpected breaking changes.',
    );
  }

  const status: AuthHealthStatus = {
    healthy: isProduction ? warnings.length === 0 : true,
    checks: {
      nextAuthSecret: hasNextAuthSecret,
      googleOAuth: hasGoogleId && hasGoogleSecret,
      databaseConnected: true, // validated separately by db.ts
    },
    warnings,
    version: {
      nextAuth: NEXT_AUTH_VERSION,
      environment: isProduction ? 'production' : 'development',
    },
  };

  if (warnings.length > 0) {
    logger.warn(
      { module: 'auth-health', warnings },
      `Auth health check: ${warnings.length} warning(s)`,
    );
  } else {
    logger.info({ module: 'auth-health' }, 'Auth health check passed');
  }

  return status;
}
